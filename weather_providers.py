# ABOUTME: Weather provider classes for different weather APIs (OpenMeteo, PirateWeather)
# ABOUTME: Abstraction layer to easily switch between weather data sources

import requests
import json
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
import os
from typing import Dict, List, Optional, Any

class WeatherProvider(ABC):
    """Abstract base class for weather providers"""
    
    def __init__(self, name: str):
        self.name = name
        self.timeout = 10
        
    @abstractmethod
    def fetch_weather_data(self, lat: float, lon: float) -> Optional[Dict]:
        """Fetch raw weather data from the provider"""
        pass
    
    @abstractmethod
    def process_weather_data(self, raw_data: Dict, location_name: str = None) -> Optional[Dict]:
        """Process raw weather data into standardized format"""
        pass
    
    def get_weather(self, lat: float, lon: float, location_name: str = None) -> Optional[Dict]:
        """Get processed weather data for coordinates"""
        try:
            raw_data = self.fetch_weather_data(lat, lon)
            if raw_data:
                return self.process_weather_data(raw_data, location_name)
            return None
        except Exception as e:
            print(f"❌ {self.name} provider error: {str(e)}")
            return None
    
    def get_provider_info(self) -> Dict:
        """Get information about this provider"""
        return {
            'name': self.name,
            'timeout': self.timeout,
            'description': self.__doc__ or f'{self.name} weather provider'
        }


class OpenMeteoProvider(WeatherProvider):
    """Open-Meteo weather provider - free, accurate, European weather service"""
    
    def __init__(self):
        super().__init__('OpenMeteo')
        self.base_url = 'https://api.open-meteo.com/v1/forecast'
    
    def fetch_weather_data(self, lat: float, lon: float) -> Optional[Dict]:
        """Fetch weather data from Open-Meteo API"""
        try:
            # Build comprehensive weather request
            params = {
                'latitude': lat,
                'longitude': lon,
                'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index',
                'hourly': 'temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m',
                'daily': 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
                'temperature_unit': 'fahrenheit',
                'wind_speed_unit': 'mph',
                'precipitation_unit': 'inch',
                'timezone': 'auto',
                'forecast_days': 7
            }
            
            print(f"🌤️  Fetching from Open-Meteo API for {lat}, {lon}")
            response = requests.get(self.base_url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            print(f"❌ Open-Meteo API error: {str(e)}")
            return None
    
    def process_weather_data(self, raw_data: Dict, location_name: str = None) -> Optional[Dict]:
        """Process Open-Meteo data into standardized format"""
        if not raw_data:
            return None
        
        try:
            current = raw_data.get('current', {})
            hourly = raw_data.get('hourly', {})
            daily = raw_data.get('daily', {})
            
            # Process current weather
            current_weather = {
                'temperature': round(current.get('temperature_2m', 0)),
                'feels_like': round(current.get('apparent_temperature', 0)),
                'humidity': current.get('relative_humidity_2m', 0),
                'wind_speed': round(current.get('wind_speed_10m', 0)),
                'uv_index': current.get('uv_index', 0),
                'precipitation_rate': current.get('precipitation', 0),
                'precipitation_prob': 0,  # Current doesn't have probability
                'precipitation_type': 'rain' if current.get('precipitation', 0) > 0 else None,
                'icon': self._map_weather_code(current.get('weather_code', 0)),
                'summary': self._get_weather_description(current.get('weather_code', 0))
            }
            
            # Process hourly forecast (next 24 hours starting from current hour)
            hourly_forecast = []
            if hourly.get('time'):
                current_time = datetime.now()
                
                # Find the starting index (current hour or next hour)
                start_index = 0
                for i, time_str in enumerate(hourly['time']):
                    hour_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    if hour_time.replace(tzinfo=None) >= current_time.replace(minute=0, second=0, microsecond=0):
                        start_index = i
                        break
                
                # Get next 24 hours starting from current/next hour
                for i in range(start_index, min(start_index + 24, len(hourly['time']))):
                    hour_data = {
                        'temp': round(hourly['temperature_2m'][i]),
                        'icon': self._map_weather_code(hourly['weather_code'][i]),
                        'rain': hourly['precipitation_probability'][i] if i < len(hourly.get('precipitation_probability', [])) else 0,
                        't': datetime.fromisoformat(hourly['time'][i].replace('Z', '+00:00')).strftime('%I%p').lower().replace('0', ''),
                        'desc': self._get_weather_description(hourly['weather_code'][i])
                    }
                    hourly_forecast.append(hour_data)
            
            # Process daily forecast
            daily_forecast = []
            if daily.get('time'):
                for i in range(min(7, len(daily['time']))):
                    day_data = {
                        'h': round(daily['temperature_2m_max'][i]),
                        'l': round(daily['temperature_2m_min'][i]),
                        'icon': self._map_weather_code(daily['weather_code'][i]),
                        'd': datetime.fromisoformat(daily['time'][i]).strftime('%a')
                    }
                    daily_forecast.append(day_data)
            
            return {
                'current': current_weather,
                'hourly': hourly_forecast,
                'daily': daily_forecast,
                'location': location_name or 'Unknown Location',
                'provider': self.name
            }
            
        except Exception as e:
            print(f"❌ Error processing Open-Meteo data: {str(e)}")
            return None
    
    def _map_weather_code(self, code: int) -> str:
        """Map Open-Meteo WMO weather codes to our icon codes"""
        code_map = {
            0: 'clear-day',           # Clear sky
            1: 'clear-day',           # Mainly clear
            2: 'partly-cloudy-day',   # Partly cloudy
            3: 'cloudy',              # Overcast
            45: 'fog',                # Fog
            48: 'fog',                # Depositing rime fog
            51: 'light-rain',         # Light drizzle
            53: 'rain',               # Moderate drizzle
            55: 'heavy-rain',         # Dense drizzle
            61: 'light-rain',         # Slight rain
            63: 'rain',               # Moderate rain
            65: 'heavy-rain',         # Heavy rain
            71: 'light-snow',         # Slight snow fall
            73: 'snow',               # Moderate snow fall
            75: 'heavy-snow',         # Heavy snow fall
            80: 'light-rain',         # Slight rain showers
            81: 'rain',               # Moderate rain showers
            82: 'heavy-rain',         # Violent rain showers
            85: 'light-snow',         # Slight snow showers
            86: 'heavy-snow',         # Heavy snow showers
            95: 'thunderstorm',       # Thunderstorm
            96: 'thunderstorm',       # Thunderstorm with slight hail
            99: 'thunderstorm',       # Thunderstorm with heavy hail
        }
        return code_map.get(code, 'clear-day')
    
    def _get_weather_description(self, weather_code: int) -> str:
        """Get human-readable weather description from WMO code"""
        descriptions = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Foggy',
            48: 'Depositing rime fog',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            61: 'Slight rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            71: 'Slight snow',
            73: 'Moderate snow',
            75: 'Heavy snow',
            80: 'Slight rain showers',
            81: 'Moderate rain showers',
            82: 'Violent rain showers',
            85: 'Slight snow showers',
            86: 'Heavy snow showers',
            95: 'Thunderstorm',
            96: 'Thunderstorm with slight hail',
            99: 'Thunderstorm with heavy hail'
        }
        return descriptions.get(weather_code, 'Unknown')


class PirateWeatherProvider(WeatherProvider):
    """PirateWeather provider - Dark Sky API replacement"""
    
    def __init__(self, api_key: str):
        super().__init__('PirateWeather')
        self.api_key = api_key
        self.base_url = 'https://api.pirateweather.net/forecast'
    
    def fetch_weather_data(self, lat: float, lon: float) -> Optional[Dict]:
        """Fetch weather data from PirateWeather API"""
        if not self.api_key or self.api_key == 'YOUR_API_KEY_HERE':
            print("❌ PirateWeather API key not configured")
            return None
        
        try:
            url = f"{self.base_url}/{self.api_key}/{lat},{lon}"
            print(f"🏴‍☠️ Fetching from PirateWeather API for {lat}, {lon}")
            
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            print(f"❌ PirateWeather API error: {str(e)}")
            return None
    
    def process_weather_data(self, raw_data: Dict, location_name: str = None) -> Optional[Dict]:
        """Process PirateWeather data into standardized format"""
        if not raw_data:
            return None
        
        try:
            current = raw_data.get('currently', {})
            hourly = raw_data.get('hourly', {}).get('data', [])
            daily = raw_data.get('daily', {}).get('data', [])
            
            # Process current weather
            current_weather = {
                'temperature': round(current.get('temperature', 0)),
                'feels_like': round(current.get('apparentTemperature', 0)),
                'humidity': round(current.get('humidity', 0) * 100),
                'wind_speed': round(current.get('windSpeed', 0)),
                'uv_index': current.get('uvIndex', 0),
                'precipitation_rate': current.get('precipIntensity', 0),
                'precipitation_prob': round(current.get('precipProbability', 0) * 100),
                'precipitation_type': current.get('precipType'),
                'icon': self._map_icon_code(current.get('icon', 'clear-day')),
                'summary': current.get('summary', 'Unknown')
            }
            
            # Process hourly forecast (next 24 hours starting from current hour)
            hourly_forecast = []
            if hourly:
                current_time = datetime.now()
                
                # Find the starting index (current hour or next hour)
                start_index = 0
                for i, hour in enumerate(hourly):
                    hour_time = datetime.fromtimestamp(hour.get('time', 0))
                    if hour_time >= current_time.replace(minute=0, second=0, microsecond=0):
                        start_index = i
                        break
                
                # Get next 24 hours starting from current/next hour
                for i in range(start_index, min(start_index + 24, len(hourly))):
                    hour = hourly[i]
                    hour_data = {
                        'temp': round(hour.get('temperature', 0)),
                        'icon': self._map_icon_code(hour.get('icon', 'clear-day')),
                        'rain': round(hour.get('precipProbability', 0) * 100),
                        't': datetime.fromtimestamp(hour.get('time', 0)).strftime('%I%p').lower().replace('0', ''),
                        'desc': hour.get('summary', 'Unknown')
                    }
                    hourly_forecast.append(hour_data)
            
            # Process daily forecast
            daily_forecast = []
            for day in daily[:7]:
                day_data = {
                    'h': round(day.get('temperatureHigh', 0)),
                    'l': round(day.get('temperatureLow', 0)),
                    'icon': self._map_icon_code(day.get('icon', 'clear-day')),
                    'd': datetime.fromtimestamp(day.get('time', 0)).strftime('%a')
                }
                daily_forecast.append(day_data)
            
            return {
                'current': current_weather,
                'hourly': hourly_forecast,
                'daily': daily_forecast,
                'location': location_name or 'Unknown Location',
                'provider': self.name
            }
            
        except Exception as e:
            print(f"❌ Error processing PirateWeather data: {str(e)}")
            return None
    
    def _map_icon_code(self, icon_code: str) -> str:
        """Map PirateWeather icon codes to our standardized codes"""
        icon_map = {
            'clear-day': 'clear-day',
            'clear-night': 'clear-night',
            'rain': 'rain',
            'snow': 'snow',
            'sleet': 'sleet',
            'wind': 'wind',
            'fog': 'fog',
            'cloudy': 'cloudy',
            'partly-cloudy-day': 'partly-cloudy-day',
            'partly-cloudy-night': 'partly-cloudy-night',
            'hail': 'hail',
            'thunderstorm': 'thunderstorm',
            'tornado': 'wind'
        }
        return icon_map.get(icon_code, 'clear-day')


class WeatherProviderManager:
    """Manager class to handle multiple weather providers"""
    
    def __init__(self):
        self.providers = {}
        self.primary_provider = None
        self.fallback_providers = []
    
    def add_provider(self, provider: WeatherProvider, is_primary: bool = False):
        """Add a weather provider to the manager"""
        self.providers[provider.name] = provider
        
        if is_primary:
            self.primary_provider = provider.name
        else:
            self.fallback_providers.append(provider.name)
    
    def set_primary_provider(self, provider_name: str):
        """Set the primary weather provider"""
        if provider_name in self.providers:
            self.primary_provider = provider_name
            # Remove from fallbacks if it was there
            if provider_name in self.fallback_providers:
                self.fallback_providers.remove(provider_name)
        else:
            raise ValueError(f"Provider '{provider_name}' not found")
    
    def get_weather(self, lat: float, lon: float, location_name: str = None) -> Optional[Dict]:
        """Get weather data using primary provider with fallbacks"""
        # Try primary provider first
        if self.primary_provider and self.primary_provider in self.providers:
            print(f"🎯 Trying primary provider: {self.primary_provider}")
            result = self.providers[self.primary_provider].get_weather(lat, lon, location_name)
            if result:
                return result
        
        # Try fallback providers
        for provider_name in self.fallback_providers:
            if provider_name in self.providers:
                print(f"🔄 Trying fallback provider: {provider_name}")
                result = self.providers[provider_name].get_weather(lat, lon, location_name)
                if result:
                    return result
        
        print("❌ All weather providers failed")
        return None
    
    def get_provider_info(self) -> Dict:
        """Get information about all available providers"""
        return {
            'primary': self.primary_provider,
            'fallbacks': self.fallback_providers,
            'providers': {name: provider.get_provider_info() for name, provider in self.providers.items()}
        }
    
    def switch_provider(self, provider_name: str) -> bool:
        """Switch to a different primary provider"""
        if provider_name in self.providers:
            # Move current primary to fallbacks
            if self.primary_provider:
                self.fallback_providers.append(self.primary_provider)
            
            # Set new primary
            self.set_primary_provider(provider_name)
            print(f"🔄 Switched to provider: {provider_name}")
            return True
        else:
            print(f"❌ Provider '{provider_name}' not found")
            return False