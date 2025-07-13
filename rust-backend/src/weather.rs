use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherData {
    pub current: CurrentWeather,
    pub hourly: Vec<HourlyForecast>,
    pub daily: Vec<DailyForecast>,
    pub location: String,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentWeather {
    pub temperature: i32,
    pub feels_like: i32,
    pub humidity: i32,
    pub wind_speed: i32,
    pub uv_index: f64,
    pub precipitation_rate: f64,
    pub precipitation_prob: i32,
    pub precipitation_type: Option<String>,
    pub icon: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyForecast {
    pub temp: i32,
    pub icon: String,
    pub rain: i32,
    pub t: String,
    pub desc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyForecast {
    pub h: i32,
    pub l: i32,
    pub icon: String,
    pub d: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub name: String,
    pub timeout: u64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSystemInfo {
    pub primary: Option<String>,
    pub fallbacks: Vec<String>,
    pub providers: HashMap<String, ProviderInfo>,
}

#[async_trait::async_trait]
pub trait WeatherProvider: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    async fn fetch_weather_data(&self, lat: f64, lon: f64) -> Result<serde_json::Value>;
    async fn process_weather_data(&self, raw_data: serde_json::Value, location_name: &str) -> Result<WeatherData>;
    
    async fn get_weather(&self, lat: f64, lon: f64, location_name: &str) -> Result<WeatherData> {
        let raw_data = self.fetch_weather_data(lat, lon).await?;
        self.process_weather_data(raw_data, location_name).await
    }
    
    fn get_provider_info(&self) -> ProviderInfo {
        ProviderInfo {
            name: self.name().to_string(),
            timeout: 10,
            description: self.description().to_string(),
        }
    }
}

pub struct OpenMeteoProvider {
    client: Client,
    base_url: String,
}

impl OpenMeteoProvider {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;
        
        Ok(Self {
            client,
            base_url: "https://api.open-meteo.com/v1/forecast".to_string(),
        })
    }
    
    fn map_weather_code(&self, code: i32) -> &'static str {
        match code {
            0 => "clear-day",
            1 => "clear-day",
            2 => "partly-cloudy-day",
            3 => "cloudy",
            45 | 48 => "fog",
            51 => "light-rain",
            53 => "rain",
            55 => "heavy-rain",
            61 => "light-rain",
            63 => "rain",
            65 => "heavy-rain",
            71 => "light-snow",
            73 => "snow",
            75 => "heavy-snow",
            80 => "light-rain",
            81 => "rain",
            82 => "heavy-rain",
            85 => "light-snow",
            86 => "heavy-snow",
            95 | 96 | 99 => "thunderstorm",
            _ => "clear-day",
        }
    }
    
    fn get_weather_description(&self, code: i32) -> &'static str {
        match code {
            0 => "Clear sky",
            1 => "Mainly clear",
            2 => "Partly cloudy",
            3 => "Overcast",
            45 => "Foggy",
            48 => "Depositing rime fog",
            51 => "Light drizzle",
            53 => "Moderate drizzle",
            55 => "Dense drizzle",
            61 => "Slight rain",
            63 => "Moderate rain",
            65 => "Heavy rain",
            71 => "Slight snow",
            73 => "Moderate snow",
            75 => "Heavy snow",
            80 => "Slight rain showers",
            81 => "Moderate rain showers",
            82 => "Violent rain showers",
            85 => "Slight snow showers",
            86 => "Heavy snow showers",
            95 => "Thunderstorm",
            96 => "Thunderstorm with slight hail",
            99 => "Thunderstorm with heavy hail",
            _ => "Unknown",
        }
    }
}

#[async_trait::async_trait]
impl WeatherProvider for OpenMeteoProvider {
    fn name(&self) -> &str {
        "OpenMeteo"
    }
    
    fn description(&self) -> &str {
        "Open-Meteo weather provider - free, accurate, European weather service"
    }
    
    async fn fetch_weather_data(&self, lat: f64, lon: f64) -> Result<serde_json::Value> {
        let url = format!("{}?latitude={}&longitude={}", self.base_url, lat, lon);
        let params = [
            ("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index"),
            ("hourly", "temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m"),
            ("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max"),
            ("temperature_unit", "fahrenheit"),
            ("wind_speed_unit", "mph"),
            ("precipitation_unit", "inch"),
            ("timezone", "auto"),
            ("forecast_days", "7"),
        ];
        
        info!("🌤️  Fetching from Open-Meteo API for {}, {}", lat, lon);
        
        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;
        
        if response.status().is_success() {
            let data = response.json().await?;
            Ok(data)
        } else {
            Err(anyhow!("Open-Meteo API error: {}", response.status()))
        }
    }
    
    async fn process_weather_data(&self, raw_data: serde_json::Value, location_name: &str) -> Result<WeatherData> {
        let current = raw_data["current"].as_object().ok_or_else(|| anyhow!("Missing current weather data"))?;
        let hourly = raw_data["hourly"].as_object().ok_or_else(|| anyhow!("Missing hourly weather data"))?;
        let daily = raw_data["daily"].as_object().ok_or_else(|| anyhow!("Missing daily weather data"))?;
        
        // Process current weather
        let current_weather = CurrentWeather {
            temperature: current["temperature_2m"].as_f64().unwrap_or(0.0) as i32,
            feels_like: current["apparent_temperature"].as_f64().unwrap_or(0.0) as i32,
            humidity: current["relative_humidity_2m"].as_f64().unwrap_or(0.0) as i32,
            wind_speed: current["wind_speed_10m"].as_f64().unwrap_or(0.0) as i32,
            uv_index: current["uv_index"].as_f64().unwrap_or(0.0),
            precipitation_rate: current["precipitation"].as_f64().unwrap_or(0.0),
            precipitation_prob: 0, // Current doesn't have probability
            precipitation_type: if current["precipitation"].as_f64().unwrap_or(0.0) > 0.0 { Some("rain".to_string()) } else { None },
            icon: self.map_weather_code(current["weather_code"].as_i64().unwrap_or(0) as i32).to_string(),
            summary: self.get_weather_description(current["weather_code"].as_i64().unwrap_or(0) as i32).to_string(),
        };
        
        // Process hourly forecast
        let mut hourly_forecast = Vec::new();
        if let Some(times) = hourly["time"].as_array() {
            let temperatures = hourly["temperature_2m"].as_array().unwrap_or(&vec![]);
            let weather_codes = hourly["weather_code"].as_array().unwrap_or(&vec![]);
            let precipitation_probs = hourly["precipitation_probability"].as_array().unwrap_or(&vec![]);
            
            for (i, time_str) in times.iter().enumerate().take(24) {
                if let Some(time_str) = time_str.as_str() {
                    if let Ok(datetime) = DateTime::parse_from_rfc3339(time_str) {
                        let temp = temperatures.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                        let weather_code = weather_codes.get(i).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let rain = precipitation_probs.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                        
                        hourly_forecast.push(HourlyForecast {
                            temp,
                            icon: self.map_weather_code(weather_code).to_string(),
                            rain,
                            t: datetime.format("%I%p").to_string().to_lowercase().replace("0", ""),
                            desc: self.get_weather_description(weather_code).to_string(),
                        });
                    }
                }
            }
        }
        
        // Process daily forecast
        let mut daily_forecast = Vec::new();
        if let Some(times) = daily["time"].as_array() {
            let temp_max = daily["temperature_2m_max"].as_array().unwrap_or(&vec![]);
            let temp_min = daily["temperature_2m_min"].as_array().unwrap_or(&vec![]);
            let weather_codes = daily["weather_code"].as_array().unwrap_or(&vec![]);
            
            for (i, time_str) in times.iter().enumerate().take(7) {
                if let Some(time_str) = time_str.as_str() {
                    if let Ok(date) = chrono::NaiveDate::parse_from_str(time_str, "%Y-%m-%d") {
                        let high = temp_max.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                        let low = temp_min.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                        let weather_code = weather_codes.get(i).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        
                        daily_forecast.push(DailyForecast {
                            h: high,
                            l: low,
                            icon: self.map_weather_code(weather_code).to_string(),
                            d: date.format("%a").to_string(),
                        });
                    }
                }
            }
        }
        
        Ok(WeatherData {
            current: current_weather,
            hourly: hourly_forecast,
            daily: daily_forecast,
            location: location_name.to_string(),
            provider: self.name().to_string(),
        })
    }
}

pub struct PirateWeatherProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl PirateWeatherProvider {
    pub fn new(api_key: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;
        
        Ok(Self {
            client,
            api_key,
            base_url: "https://api.pirateweather.net/forecast".to_string(),
        })
    }
    
    fn map_icon_code(&self, icon_code: &str) -> &'static str {
        match icon_code {
            "clear-day" => "clear-day",
            "clear-night" => "clear-night",
            "rain" => "rain",
            "snow" => "snow",
            "sleet" => "sleet",
            "wind" => "wind",
            "fog" => "fog",
            "cloudy" => "cloudy",
            "partly-cloudy-day" => "partly-cloudy-day",
            "partly-cloudy-night" => "partly-cloudy-night",
            "hail" => "hail",
            "thunderstorm" => "thunderstorm",
            "tornado" => "wind",
            _ => "clear-day",
        }
    }
}

#[async_trait::async_trait]
impl WeatherProvider for PirateWeatherProvider {
    fn name(&self) -> &str {
        "PirateWeather"
    }
    
    fn description(&self) -> &str {
        "PirateWeather provider - Dark Sky API replacement"
    }
    
    async fn fetch_weather_data(&self, lat: f64, lon: f64) -> Result<serde_json::Value> {
        if self.api_key.is_empty() || self.api_key == "YOUR_API_KEY_HERE" {
            return Err(anyhow!("PirateWeather API key not configured"));
        }
        
        let url = format!("{}/{}/{},{}", self.base_url, self.api_key, lat, lon);
        
        info!("🏴‍☠️ Fetching from PirateWeather API for {}, {}", lat, lon);
        
        let response = self.client
            .get(&url)
            .send()
            .await?;
        
        if response.status().is_success() {
            let data = response.json().await?;
            Ok(data)
        } else {
            Err(anyhow!("PirateWeather API error: {}", response.status()))
        }
    }
    
    async fn process_weather_data(&self, raw_data: serde_json::Value, location_name: &str) -> Result<WeatherData> {
        let current = raw_data["currently"].as_object().ok_or_else(|| anyhow!("Missing current weather data"))?;
        let hourly_data = raw_data["hourly"]["data"].as_array().ok_or_else(|| anyhow!("Missing hourly weather data"))?;
        let daily_data = raw_data["daily"]["data"].as_array().ok_or_else(|| anyhow!("Missing daily weather data"))?;
        
        // Process current weather
        let current_weather = CurrentWeather {
            temperature: current["temperature"].as_f64().unwrap_or(0.0) as i32,
            feels_like: current["apparentTemperature"].as_f64().unwrap_or(0.0) as i32,
            humidity: (current["humidity"].as_f64().unwrap_or(0.0) * 100.0) as i32,
            wind_speed: current["windSpeed"].as_f64().unwrap_or(0.0) as i32,
            uv_index: current["uvIndex"].as_f64().unwrap_or(0.0),
            precipitation_rate: current["precipIntensity"].as_f64().unwrap_or(0.0),
            precipitation_prob: (current["precipProbability"].as_f64().unwrap_or(0.0) * 100.0) as i32,
            precipitation_type: current["precipType"].as_str().map(|s| s.to_string()),
            icon: self.map_icon_code(current["icon"].as_str().unwrap_or("clear-day")).to_string(),
            summary: current["summary"].as_str().unwrap_or("Unknown").to_string(),
        };
        
        // Process hourly forecast
        let mut hourly_forecast = Vec::new();
        let now = chrono::Utc::now().timestamp();
        
        for (i, hour) in hourly_data.iter().enumerate().take(24) {
            let time = hour["time"].as_i64().unwrap_or(0);
            if time >= now {
                let temp = hour["temperature"].as_f64().unwrap_or(0.0) as i32;
                let icon = self.map_icon_code(hour["icon"].as_str().unwrap_or("clear-day"));
                let rain = (hour["precipProbability"].as_f64().unwrap_or(0.0) * 100.0) as i32;
                let t = chrono::DateTime::from_timestamp(time, 0)
                    .unwrap_or_default()
                    .format("%I%p")
                    .to_string()
                    .to_lowercase()
                    .replace("0", "");
                let desc = hour["summary"].as_str().unwrap_or("Unknown").to_string();
                
                hourly_forecast.push(HourlyForecast {
                    temp,
                    icon: icon.to_string(),
                    rain,
                    t,
                    desc,
                });
            }
        }
        
        // Process daily forecast
        let mut daily_forecast = Vec::new();
        for day in daily_data.iter().take(7) {
            let high = day["temperatureHigh"].as_f64().unwrap_or(0.0) as i32;
            let low = day["temperatureLow"].as_f64().unwrap_or(0.0) as i32;
            let icon = self.map_icon_code(day["icon"].as_str().unwrap_or("clear-day"));
            let time = day["time"].as_i64().unwrap_or(0);
            let d = chrono::DateTime::from_timestamp(time, 0)
                .unwrap_or_default()
                .format("%a")
                .to_string();
            
            daily_forecast.push(DailyForecast {
                h: high,
                l: low,
                icon: icon.to_string(),
                d,
            });
        }
        
        Ok(WeatherData {
            current: current_weather,
            hourly: hourly_forecast,
            daily: daily_forecast,
            location: location_name.to_string(),
            provider: self.name().to_string(),
        })
    }
}

pub struct WeatherProviderManager {
    providers: Arc<RwLock<HashMap<String, Box<dyn WeatherProvider>>>>,
    primary_provider: Arc<RwLock<Option<String>>>,
    fallback_providers: Arc<RwLock<Vec<String>>>,
}

impl WeatherProviderManager {
    pub fn new() -> Self {
        Self {
            providers: Arc::new(RwLock::new(HashMap::new())),
            primary_provider: Arc::new(RwLock::new(None)),
            fallback_providers: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    pub async fn add_openmeteo_provider(&mut self) -> Result<()> {
        let provider = OpenMeteoProvider::new()?;
        let name = provider.name().to_string();
        
        let mut providers = self.providers.write().await;
        providers.insert(name.clone(), Box::new(provider));
        
        // Set as primary if no primary exists
        let mut primary = self.primary_provider.write().await;
        if primary.is_none() {
            *primary = Some(name);
        }
        
        Ok(())
    }
    
    pub async fn add_pirate_weather_provider(&mut self, api_key: String) -> Result<()> {
        let provider = PirateWeatherProvider::new(api_key)?;
        let name = provider.name().to_string();
        
        let mut providers = self.providers.write().await;
        providers.insert(name.clone(), Box::new(provider));
        
        // Add to fallbacks
        let mut fallbacks = self.fallback_providers.write().await;
        fallbacks.push(name);
        
        Ok(())
    }
    
    pub async fn get_weather(&self, lat: f64, lon: f64, location_name: &str) -> Result<WeatherData> {
        // Try primary provider first
        let primary = self.primary_provider.read().await;
        if let Some(primary_name) = primary.as_ref() {
            let providers = self.providers.read().await;
            if let Some(provider) = providers.get(primary_name) {
                info!("🎯 Trying primary provider: {}", primary_name);
                match provider.get_weather(lat, lon, location_name).await {
                    Ok(data) => return Ok(data),
                    Err(e) => warn!("❌ Primary provider {} failed: {}", primary_name, e),
                }
            }
        }
        
        // Try fallback providers
        let fallbacks = self.fallback_providers.read().await;
        let providers = self.providers.read().await;
        
        for fallback_name in fallbacks.iter() {
            if let Some(provider) = providers.get(fallback_name) {
                info!("🔄 Trying fallback provider: {}", fallback_name);
                match provider.get_weather(lat, lon, location_name).await {
                    Ok(data) => return Ok(data),
                    Err(e) => warn!("❌ Fallback provider {} failed: {}", fallback_name, e),
                }
            }
        }
        
        Err(anyhow!("All weather providers failed"))
    }
    
    pub async fn get_provider_info(&self) -> ProviderSystemInfo {
        let providers = self.providers.read().await;
        let primary = self.primary_provider.read().await;
        let fallbacks = self.fallback_providers.read().await;
        
        let mut provider_infos = HashMap::new();
        for (name, provider) in providers.iter() {
            provider_infos.insert(name.clone(), provider.get_provider_info());
        }
        
        ProviderSystemInfo {
            primary: primary.clone(),
            fallbacks: fallbacks.clone(),
            providers: provider_infos,
        }
    }
    
    pub async fn get_available_providers(&self) -> Vec<String> {
        let providers = self.providers.read().await;
        providers.keys().cloned().collect()
    }
    
    pub async fn switch_provider(&self, provider_name: &str) -> Result<()> {
        let providers = self.providers.read().await;
        
        if !providers.contains_key(provider_name) {
            return Err(anyhow!("Provider '{}' not found", provider_name));
        }
        
        // Move current primary to fallbacks
        let mut primary = self.primary_provider.write().await;
        if let Some(current_primary) = primary.take() {
            let mut fallbacks = self.fallback_providers.write().await;
            fallbacks.push(current_primary);
        }
        
        // Set new primary
        *primary = Some(provider_name.to_string());
        
        // Remove from fallbacks if it was there
        let mut fallbacks = self.fallback_providers.write().await;
        fallbacks.retain(|name| name != provider_name);
        
        info!("🔄 Switched to provider: {}", provider_name);
        Ok(())
    }
}