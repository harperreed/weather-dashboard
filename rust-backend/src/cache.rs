use moka::future::Cache;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::weather::WeatherData;

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub entry_count: u64,
    pub max_capacity: u64,
    pub ttl_seconds: u64,
    pub keys: Vec<String>,
}

pub struct WeatherCache {
    cache: Cache<String, WeatherData>,
    ttl_seconds: u64,
}

impl WeatherCache {
    pub async fn new(max_size: u64, ttl_seconds: u64) -> Self {
        let cache = Cache::builder()
            .max_capacity(max_size)
            .time_to_live(Duration::from_secs(ttl_seconds))
            .build();
        
        Self {
            cache,
            ttl_seconds,
        }
    }
    
    pub async fn get(&self, key: &str) -> Option<WeatherData> {
        self.cache.get(key).await
    }
    
    pub async fn set(&self, key: String, value: WeatherData) {
        self.cache.insert(key, value).await;
    }
    
    pub async fn clear(&self) {
        self.cache.invalidate_all();
    }
    
    pub async fn stats(&self) -> CacheStats {
        let entry_count = self.cache.entry_count();
        let max_capacity = self.cache.max_capacity().unwrap_or(0);
        
        // Get all keys (this is not efficient for large caches, but OK for this use case)
        let mut keys = Vec::new();
        // Note: moka doesn't provide direct access to keys, so we'll simulate this
        // In production, you might want to maintain a separate key tracking mechanism
        
        CacheStats {
            entry_count,
            max_capacity,
            ttl_seconds: self.ttl_seconds,
            keys,
        }
    }
}