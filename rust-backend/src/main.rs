use anyhow::Result;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
    compression::CompressionLayer,
};
use tracing::{info, warn};

mod weather;
mod cache;
mod config;
mod templates;

use weather::{WeatherProvider, WeatherProviderManager};
use cache::WeatherCache;
use config::Config;
use templates::WeatherTemplate;

#[derive(Clone)]
pub struct AppState {
    weather_manager: Arc<WeatherProviderManager>,
    cache: Arc<WeatherCache>,
    config: Arc<Config>,
}

#[derive(Deserialize)]
pub struct WeatherQuery {
    lat: Option<f64>,
    lon: Option<f64>,
    location: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ProviderSwitchRequest {
    provider: String,
}

#[derive(Serialize)]
pub struct ApiResponse<T> {
    #[serde(flatten)]
    data: T,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    error: String,
}

// City coordinates constants
lazy_static::lazy_static! {
    static ref CITY_COORDS: HashMap<&'static str, (f64, f64, &'static str)> = {
        let mut map = HashMap::new();
        map.insert("chicago", (41.8781, -87.6298, "Chicago"));
        map.insert("nyc", (40.7128, -74.0060, "New York City"));
        map.insert("sf", (37.7749, -122.4194, "San Francisco"));
        map.insert("london", (51.5074, -0.1278, "London"));
        map.insert("paris", (48.8566, 2.3522, "Paris"));
        map.insert("tokyo", (35.6762, 139.6503, "Tokyo"));
        map.insert("sydney", (-33.8688, 151.2093, "Sydney"));
        map.insert("berlin", (52.5200, 13.4050, "Berlin"));
        map.insert("rome", (41.9028, 12.4964, "Rome"));
        map.insert("madrid", (40.4168, -3.7038, "Madrid"));
        map
    };
}

// Default Chicago coordinates
const DEFAULT_LAT: f64 = 41.8781;
const DEFAULT_LON: f64 = -87.6298;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::init();

    // Load configuration
    let config = Arc::new(Config::load()?);
    
    // Initialize weather providers
    let mut weather_manager = WeatherProviderManager::new();
    weather_manager.add_openmeteo_provider()?;
    
    // Add PirateWeather provider if API key is available
    if let Some(api_key) = &config.pirate_weather_api_key {
        if !api_key.is_empty() && api_key != "YOUR_API_KEY_HERE" {
            weather_manager.add_pirate_weather_provider(api_key.clone())?;
        }
    }
    
    let weather_manager = Arc::new(weather_manager);

    // Initialize cache
    let cache = Arc::new(WeatherCache::new(100, 600).await); // 100 entries, 10 minutes TTL

    // Create application state
    let state = AppState {
        weather_manager,
        cache,
        config,
    };

    // Build application router
    let app = Router::new()
        .route("/", get(index))
        .route("/:lat,:lon", get(weather_by_coords))
        .route("/:lat,:lon/:location", get(weather_by_coords_and_location))
        .route("/:city", get(weather_by_city))
        .route("/api/weather", get(weather_api))
        .route("/api/cache/stats", get(cache_stats))
        .route("/api/providers", get(get_providers))
        .route("/api/providers/switch", post(switch_provider))
        .nest_service("/static", ServeDir::new("static"))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::very_permissive())
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 5001));
    info!("🦀 Rust weather server starting on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn index() -> impl IntoResponse {
    Html(WeatherTemplate::render(None))
}

async fn weather_by_coords(Path((lat, lon)): Path<(f64, f64)>) -> impl IntoResponse {
    Html(WeatherTemplate::render(Some(format!("Lat: {}, Lon: {}", lat, lon))))
}

async fn weather_by_coords_and_location(
    Path((lat, lon, location)): Path<(f64, f64, String)>
) -> impl IntoResponse {
    Html(WeatherTemplate::render(Some(location)))
}

async fn weather_by_city(Path(city): Path<String>) -> impl IntoResponse {
    let city_lower = city.to_lowercase();
    
    if let Some((_, _, name)) = CITY_COORDS.get(city_lower.as_str()) {
        Html(WeatherTemplate::render(Some(name.to_string())))
    } else {
        let available_cities: Vec<&str> = CITY_COORDS.keys().cloned().collect();
        (
            StatusCode::NOT_FOUND,
            format!("City '{}' not found. Available cities: {}", city, available_cities.join(", "))
        ).into_response()
    }
}

async fn weather_api(
    Query(params): Query<WeatherQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let lat = params.lat.unwrap_or(DEFAULT_LAT);
    let lon = params.lon.unwrap_or(DEFAULT_LON);
    let location = params.location.unwrap_or_else(|| "Chicago".to_string());

    // Create cache key
    let cache_key = format!("{:.4},{:.4}", lat, lon);

    // Check cache first
    if let Some(cached_data) = state.cache.get(&cache_key).await {
        info!("📦 Returning cached data for {}", cache_key);
        let mut response_data = cached_data;
        response_data.location = location; // Update location name
        return Json(response_data).into_response();
    }

    // Fetch from weather provider
    info!("🌤️  Fetching weather for {} using provider system", location);
    
    match state.weather_manager.get_weather(lat, lon, &location).await {
        Ok(weather_data) => {
            // Cache the result
            state.cache.set(cache_key.clone(), weather_data.clone()).await;
            info!("💾 Cached weather data for {}", cache_key);
            
            Json(weather_data).into_response()
        }
        Err(e) => {
            warn!("❌ Weather API error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch weather data from all sources".to_string(),
                })
            ).into_response()
        }
    }
}

async fn cache_stats(State(state): State<AppState>) -> impl IntoResponse {
    let stats = state.cache.stats().await;
    Json(json!({
        "cache_size": stats.entry_count,
        "max_size": stats.max_capacity,
        "ttl_seconds": stats.ttl_seconds,
        "cached_locations": stats.keys
    }))
}

async fn get_providers(State(state): State<AppState>) -> impl IntoResponse {
    let provider_info = state.weather_manager.get_provider_info().await;
    Json(provider_info)
}

async fn switch_provider(
    State(state): State<AppState>,
    Json(request): Json<ProviderSwitchRequest>,
) -> impl IntoResponse {
    match state.weather_manager.switch_provider(&request.provider).await {
        Ok(()) => {
            // Clear cache when switching providers
            state.cache.clear().await;
            
            let provider_info = state.weather_manager.get_provider_info().await;
            
            Json(json!({
                "success": true,
                "message": format!("Switched to {} provider", request.provider),
                "provider_info": provider_info
            })).into_response()
        }
        Err(e) => {
            let available_providers = state.weather_manager.get_available_providers().await;
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": format!("Provider {} not found", request.provider),
                    "available_providers": available_providers
                }))
            ).into_response()
        }
    }
}