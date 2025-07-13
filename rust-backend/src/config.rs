use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub secret_key: String,
    pub pirate_weather_api_key: Option<String>,
    pub port: u16,
    pub debug: bool,
}

impl Config {
    pub fn load() -> Result<Self> {
        // Load .env file if it exists
        dotenvy::dotenv().ok();
        
        let secret_key = env::var("SECRET_KEY")
            .unwrap_or_else(|_| "dev-secret-key-change-in-production".to_string());
        
        let pirate_weather_api_key = env::var("PIRATE_WEATHER_API_KEY")
            .ok()
            .filter(|key| !key.is_empty() && key != "YOUR_API_KEY_HERE");
        
        let port = env::var("PORT")
            .unwrap_or_else(|_| "5001".to_string())
            .parse()
            .unwrap_or(5001);
        
        let debug = env::var("DEBUG")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .unwrap_or(false);
        
        Ok(Self {
            secret_key,
            pirate_weather_api_key,
            port,
            debug,
        })
    }
}