# ABOUTME: Weather provider classes for OpenMeteo and National Weather Service APIs
# ABOUTME: Abstraction layer for weather data access with multiple providers

import math
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any


try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo  # type: ignore[no-redef]

import requests


class WeatherProvider(ABC):
    """Abstract base class for weather providers"""

    def __init__(self, name: str):
        self.name = name
        self.timeout = 10

    @abstractmethod
    def fetch_weather_data(
        self, lat: float, lon: float, tz_name: str | None = None
    ) -> dict[str, Any] | None:
        """Fetch raw weather data from the provider"""
        pass

    @abstractmethod
    def process_weather_data(
        self,
        raw_data: dict[str, Any],
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict[str, Any] | None:
        """Process raw weather data into standardized format"""
        pass

    def get_weather(
        self,
        lat: float,
        lon: float,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict[str, Any] | None:
        """Get processed weather data for coordinates"""
        try:
            raw_data = self.fetch_weather_data(lat, lon, tz_name)
        except Exception as e:
            print(f'❌ {self.name} provider error: {str(e)}')
            return None
        else:
            if raw_data:
                return self.process_weather_data(raw_data, location_name, tz_name)
            return None

    def get_provider_info(self) -> dict[str, Any]:
        """Get information about this provider"""
        return {
            'name': self.name,
            'timeout': self.timeout,
            'description': self.__doc__ or f'{self.name} weather provider',
        }


class OpenMeteoProvider(WeatherProvider):
    """Open-Meteo weather provider - free, accurate, European weather service"""

    def __init__(self) -> None:
        super().__init__('OpenMeteo')
        self.base_url = 'https://api.open-meteo.com/v1/forecast'

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Fetch weather data from Open-Meteo API"""
        try:
            # Build comprehensive weather request with real-time features
            params: dict[str, str | float | int] = {
                'latitude': lat,
                'longitude': lon,
                'current': (
                    'temperature_2m,relative_humidity_2m,apparent_temperature,'
                    'is_day,precipitation,rain,showers,snowfall,weather_code,'
                    'cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,'
                    'pressure_msl,surface_pressure,dew_point_2m'
                ),
                'minutely_15': (
                    'temperature_2m,precipitation,rain,snowfall,weather_code'
                ),
                'hourly': (
                    'temperature_2m,precipitation_probability,precipitation,'
                    'rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,'
                    'pressure_msl'
                ),
                'daily': (
                    'weather_code,temperature_2m_max,temperature_2m_min,'
                    'precipitation_sum,rain_sum,showers_sum,snowfall_sum,'
                    'precipitation_probability_max,wind_speed_10m_max,'
                    'uv_index_max,sunrise,sunset'
                ),
                'temperature_unit': 'fahrenheit',
                'wind_speed_unit': 'mph',
                'precipitation_unit': 'inch',
                'pressure_unit': 'inHg',
                'timezone': 'auto',
                'forecast_days': 7,
            }

            # Build the full URL for debugging
            response = requests.get(self.base_url, params=params, timeout=self.timeout)
            print(f'🌤️  Open-Meteo API URL: {response.url}')
            response.raise_for_status()

            return response.json()  # type: ignore[no-any-return]

        except Exception as e:
            print(f'❌ Open-Meteo API error: {str(e)}')
            return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Process Open-Meteo data into standardized format"""
        if not raw_data:
            return None

        try:
            current = raw_data.get('current', {})
            hourly = raw_data.get('hourly', {})
            daily = raw_data.get('daily', {})

            # Debug: Check what wind data we're getting
            wind_speed = current.get('wind_speed_10m')
            wind_direction = current.get('wind_direction_10m')
            wind_msg = f'Wind: speed={wind_speed}, direction={wind_direction}'
            print(f'🌬️  {wind_msg}')

            # Extract timezone from OpenMeteo response (overrides parameter)
            api_timezone = raw_data.get('timezone')
            if api_timezone:
                tz_name = api_timezone
                print(f'🌍 Using timezone from API: {tz_name}')

            # Process current weather with enhanced real-time data
            current_weather = {
                'temperature': round(current.get('temperature_2m', 0)),
                'feels_like': round(current.get('apparent_temperature', 0)),
                'humidity': current.get('relative_humidity_2m', 0),
                'wind_speed': round(current.get('wind_speed_10m', 0)),
                'wind_direction': current.get('wind_direction_10m'),
                'wind_gust': round(current.get('wind_gusts_10m', 0)),
                'uv_index': current.get('uv_index', 0),
                'pressure': round(current.get('pressure_msl', 0), 2),
                'dew_point': round(current.get('dew_point_2m', 0)),
                'precipitation_rate': current.get('precipitation', 0),
                'rain_rate': current.get('rain', 0),
                'shower_rate': current.get('showers', 0),
                'snow_rate': current.get('snowfall', 0),
                'precipitation_prob': 0,  # Current doesn't have probability
                'precipitation_type': self._determine_precipitation_type(
                    current.get('rain', 0),
                    current.get('showers', 0),
                    current.get('snowfall', 0),
                ),
                'is_day': current.get('is_day', 1) == 1,
                'icon': self._map_weather_code(
                    current.get('weather_code', 0), current.get('is_day', 1) == 1
                ),
                'summary': self._get_weather_description(
                    current.get('weather_code', 0)
                ),
            }

            # Process hourly forecast (next 24 hours starting from current hour)
            hourly_forecast = []
            if hourly.get('time'):
                tz = (
                    zoneinfo.ZoneInfo(tz_name)
                    if tz_name
                    else zoneinfo.ZoneInfo('America/Chicago')
                )
                current_time = datetime.now(tz)

                # Find the starting index (current hour or next hour)
                start_index = 0
                for i, time_str in enumerate(hourly['time']):
                    hour_time = datetime.fromisoformat(
                        time_str.replace('Z', '+00:00')
                    ).astimezone(tz)
                    if hour_time >= current_time.replace(
                        minute=0, second=0, microsecond=0
                    ):
                        start_index = i
                        break

                # Get next 24 hours starting from current/next hour
                pressure_history = []  # Store for trend analysis
                for i in range(start_index, min(start_index + 24, len(hourly['time']))):
                    pressure_value = hourly.get(
                        'pressure_msl', [0] * len(hourly['time'])
                    )[i]
                    hour_data = {
                        'temp': round(hourly['temperature_2m'][i]),
                        'icon': self._map_weather_code(hourly['weather_code'][i]),
                        'rain': hourly['precipitation_probability'][i]
                        if i < len(hourly.get('precipitation_probability', []))
                        else 0,
                        't': datetime.fromisoformat(
                            hourly['time'][i].replace('Z', '+00:00')
                        )
                        .astimezone(tz)
                        .strftime('%I%p')
                        .lower()
                        .replace('0', ''),
                        'desc': self._get_weather_description(
                            hourly['weather_code'][i]
                        ),
                        'pressure': round(pressure_value, 1),
                    }
                    hourly_forecast.append(hour_data)
                    pressure_history.append(
                        {
                            'time': hourly['time'][i],
                            'pressure': round(pressure_value, 1),
                        }
                    )

            # Process daily forecast
            daily_forecast = []
            if daily.get('time'):
                for i in range(min(7, len(daily['time']))):
                    day_data = {
                        'h': round(daily['temperature_2m_max'][i]),
                        'l': round(daily['temperature_2m_min'][i]),
                        'icon': self._map_weather_code(daily['weather_code'][i]),
                        'd': (
                            datetime.fromisoformat(daily['time'][i])
                            .astimezone(tz)
                            .strftime('%a')
                        ),
                    }
                    daily_forecast.append(day_data)

            # Process sunrise/sunset data
            sun_data = {}
            if daily.get('time') and daily.get('sunrise') and daily.get('sunset'):
                for i in range(min(7, len(daily['time']))):
                    date_str = daily['time'][i]
                    sun_data[date_str] = {
                        'sunrise': daily['sunrise'][i],
                        'sunset': daily['sunset'][i],
                    }

        except Exception as e:
            print(f'❌ Error processing Open-Meteo data: {str(e)}')
            return None
        else:
            # Process 15-minute precipitation data for real-time updates
            minutely_data = self._process_minutely_data(
                raw_data.get('minutely_15', {}), tz_name
            )

            # Calculate pressure trends
            from main import calculate_pressure_trend

            pressure_trend = calculate_pressure_trend(pressure_history)

            return {
                'current': current_weather,
                'hourly': hourly_forecast,
                'daily': daily_forecast,
                'minutely': minutely_data,
                'sun': sun_data,
                'pressure_trend': pressure_trend,
                'location': location_name or 'Unknown Location',
                'provider': self.name,
            }

    def _map_weather_code(self, code: int, is_day: bool = True) -> str:
        """Map Open-Meteo WMO weather codes to our icon codes with day/night support"""
        if is_day:
            code_map = {
                0: 'clear-day',  # Clear sky
                1: 'clear-day',  # Mainly clear
                2: 'partly-cloudy-day',  # Partly cloudy
                3: 'cloudy',  # Overcast
                45: 'fog',  # Fog
                48: 'fog',  # Depositing rime fog
                51: 'light-rain',  # Light drizzle
                53: 'rain',  # Moderate drizzle
                55: 'heavy-rain',  # Dense drizzle
                61: 'light-rain',  # Slight rain
                63: 'rain',  # Moderate rain
                65: 'heavy-rain',  # Heavy rain
                71: 'light-snow',  # Slight snow fall
                73: 'snow',  # Moderate snow fall
                75: 'heavy-snow',  # Heavy snow fall
                80: 'light-rain',  # Slight rain showers
                81: 'rain',  # Moderate rain showers
                82: 'heavy-rain',  # Violent rain showers
                85: 'light-snow',  # Slight snow showers
                86: 'heavy-snow',  # Heavy snow showers
                95: 'thunderstorm',  # Thunderstorm
                96: 'thunderstorm',  # Thunderstorm with slight hail
                99: 'thunderstorm',  # Thunderstorm with heavy hail
            }
        else:
            code_map = {
                0: 'clear-night',  # Clear sky
                1: 'clear-night',  # Mainly clear
                2: 'partly-cloudy-night',  # Partly cloudy
                3: 'cloudy',  # Overcast (same day/night)
                45: 'fog',  # Fog (same day/night)
                48: 'fog',  # Depositing rime fog (same day/night)
                51: 'light-rain',  # Light drizzle
                53: 'rain',  # Moderate drizzle
                55: 'heavy-rain',  # Dense drizzle
                61: 'light-rain',  # Slight rain
                63: 'rain',  # Moderate rain
                65: 'heavy-rain',  # Heavy rain
                71: 'light-snow',  # Slight snow fall
                73: 'snow',  # Moderate snow fall
                75: 'heavy-snow',  # Heavy snow fall
                80: 'light-rain',  # Slight rain showers
                81: 'rain',  # Moderate rain showers
                82: 'heavy-rain',  # Violent rain showers
                85: 'light-snow',  # Slight snow showers
                86: 'heavy-snow',  # Heavy snow showers
                95: 'thunderstorm',  # Thunderstorm
                96: 'thunderstorm',  # Thunderstorm with slight hail
                99: 'thunderstorm',  # Thunderstorm with heavy hail
            }
        return code_map.get(code, 'clear-day' if is_day else 'clear-night')

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
            99: 'Thunderstorm with heavy hail',
        }
        return descriptions.get(weather_code, 'Unknown')

    def _determine_precipitation_type(
        self, rain: float, showers: float, snow: float
    ) -> str | None:
        """Determine precipitation type from separate rain/snow values"""
        total_precip = rain + showers + snow
        if total_precip <= 0:
            return None

        # If snow is significant, it's snow
        snow_threshold = 0.01
        if snow > snow_threshold:
            return 'snow'
        # If showers are more significant than rain, it's showers
        if showers > rain:
            return 'showers'
        # Otherwise it's rain
        if rain > 0:
            return 'rain'

        return None

    def _process_minutely_data(self, minutely: dict, tz_name: str | None) -> list[dict]:
        """Process 15-minutely data for real-time precipitation tracking"""
        minutely_data: list[dict] = []

        if not minutely.get('time'):
            return minutely_data

        try:
            tz = (
                zoneinfo.ZoneInfo(tz_name)
                if tz_name
                else zoneinfo.ZoneInfo('America/Chicago')
            )

            # Get next 2 hours of 15-minute data (8 intervals)
            for i in range(min(8, len(minutely['time']))):
                time_str = minutely['time'][i]
                minute_data = {
                    'time': datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    .astimezone(tz)
                    .strftime('%H:%M'),
                    'temp': round(minutely.get('temperature_2m', [0])[i]),
                    'precipitation': minutely.get('precipitation', [0])[i],
                    'rain': minutely.get('rain', [0])[i],
                    'snow': minutely.get('snowfall', [0])[i],
                    'weather_code': minutely.get('weather_code', [0])[i],
                }
                minutely_data.append(minute_data)

        except Exception as e:
            print(f'❌ Error processing minutely data: {str(e)}')

        return minutely_data


class PirateWeatherProvider(WeatherProvider):
    """PirateWeather provider - optimized for real-time current conditions"""

    def __init__(self, api_key: str):
        super().__init__('PirateWeather')
        self.api_key = api_key
        self.base_url = 'https://api.pirateweather.net/forecast'

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Fetch current conditions from PirateWeather API"""
        if not self.api_key or self.api_key == 'YOUR_API_KEY_HERE':
            print('❌ PirateWeather API key not configured')
            return None

        try:
            # Only fetch current conditions + next few hours for real-time data
            url = f'{self.base_url}/{self.api_key}/{lat},{lon}'
            params = {
                'units': 'us',
                'exclude': 'minutely,daily,alerts',  # Focus on current + hourly only
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            print(f'🏴‍☠️ PirateWeather API URL: {response.url}')
            response.raise_for_status()

            return response.json()  # type: ignore[no-any-return]

        except Exception as e:
            print(f'❌ PirateWeather API error: {str(e)}')
            return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Process PirateWeather data - focus on current conditions only"""
        if not raw_data:
            return None

        try:
            current = raw_data.get('currently', {})
            hourly = raw_data.get('hourly', {}).get('data', [])

            # Process enhanced current weather with real-time focus
            current_weather = {
                'temperature': round(current.get('temperature', 0)),
                'feels_like': round(current.get('apparentTemperature', 0)),
                'humidity': round(current.get('humidity', 0) * 100),
                'wind_speed': round(current.get('windSpeed', 0)),
                'uv_index': current.get('uvIndex', 0),
                'pressure': round(current.get('pressure', 0), 2),
                'visibility': round(current.get('visibility', 0), 1),
                'precipitation_rate': current.get('precipIntensity', 0),
                'precipitation_prob': round(current.get('precipProbability', 0) * 100),
                'precipitation_type': current.get('precipType'),
                'icon': current.get('icon', 'clear-day'),
                'summary': current.get('summary', 'Unknown'),
                'is_day': self._determine_is_day(current.get('icon', 'clear-day')),
                # Add timestamp for freshness comparison
                'timestamp': current.get('time', 0),
                'data_age': self._calculate_data_age(current.get('time', 0)),
            }

            # Process limited hourly data for immediate trends (next 6 hours only)
            hourly_forecast = []
            if hourly:
                tz = (
                    zoneinfo.ZoneInfo(tz_name)
                    if tz_name
                    else zoneinfo.ZoneInfo('America/Chicago')
                )

                # Only get next 6 hours for real-time trending
                for hour in hourly[:6]:
                    hour_data = {
                        'temp': round(hour.get('temperature', 0)),
                        'icon': hour.get('icon', 'clear-day'),
                        'rain': round(hour.get('precipProbability', 0) * 100),
                        'precipitation_rate': hour.get('precipIntensity', 0),
                        't': datetime.fromtimestamp(
                            hour.get('time', 0), tz=timezone.utc
                        )
                        .astimezone(tz)
                        .strftime('%I%p')
                        .lower()
                        .replace('0', ''),
                        'desc': hour.get('summary', 'Unknown'),
                    }
                    hourly_forecast.append(hour_data)

        except Exception as e:
            print(f'❌ Error processing PirateWeather data: {str(e)}')
            return None
        else:
            return {
                'current': current_weather,
                'hourly_short': hourly_forecast,  # Separate key for short-term data
                'location': location_name or 'Unknown Location',
                'provider': self.name,
                'data_source': 'realtime',  # Mark as real-time source
            }

    def _determine_is_day(self, icon: str) -> bool:
        """Determine if it's day based on icon (PW includes day/night in icons)"""
        return 'night' not in icon

    def _calculate_data_age(self, timestamp: int) -> int:
        """Calculate how old the data is in minutes"""
        import time

        current_time = int(time.time())
        return max(0, (current_time - timestamp) // 60)


class HybridWeatherProvider(WeatherProvider):
    """Hybrid provider that blends PirateWeather current + OpenMeteo forecasts"""

    def __init__(
        self, pirate_weather: PirateWeatherProvider, open_meteo: OpenMeteoProvider
    ):
        super().__init__('Hybrid')
        self.pirate_weather = pirate_weather
        self.open_meteo = open_meteo

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,
    ) -> dict | None:
        """Fetch data from both sources for blending"""
        pirate_data = self.pirate_weather.fetch_weather_data(lat, lon, tz_name)
        openmeteo_data = self.open_meteo.fetch_weather_data(lat, lon, tz_name)

        # Return combined raw data for processing
        return {
            'pirate_weather': pirate_data,
            'open_meteo': openmeteo_data,
        }

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Blend the best of both APIs"""
        if not raw_data:
            return None

        pirate_data = raw_data.get('pirate_weather')
        openmeteo_data = raw_data.get('open_meteo')

        # Process each source
        pirate_processed = None
        openmeteo_processed = None

        if pirate_data:
            pirate_processed = self.pirate_weather.process_weather_data(
                pirate_data, location_name, tz_name
            )

        if openmeteo_data:
            openmeteo_processed = self.open_meteo.process_weather_data(
                openmeteo_data, location_name, tz_name
            )

        return self._blend_data(pirate_processed, openmeteo_processed, location_name)

    def _blend_data(
        self,
        pirate_data: dict | None,
        openmeteo_data: dict | None,
        location_name: str | None,
    ) -> dict | None:
        """Smart blending logic with fallback handling"""
        if not pirate_data and not openmeteo_data:
            return None

        # Determine which data sources are available
        has_pirate = pirate_data is not None
        has_openmeteo = openmeteo_data is not None

        sources_msg = f'PirateWeather={has_pirate}, OpenMeteo={has_openmeteo}'
        print(f'🔍 Data sources available: {sources_msg}')

        # Start with OpenMeteo as base (reliable forecasts)
        if openmeteo_data:
            blended = openmeteo_data.copy()
        elif pirate_data:
            # Fallback: PirateWeather only
            print('⚠️  OpenMeteo failed - using PirateWeather only')
            blended = pirate_data.copy()
            blended['provider'] = 'PirateWeather (OpenMeteo fallback)'
            return blended
        else:
            return None

        # Override current conditions with PirateWeather (more real-time)
        if pirate_data and pirate_data.get('current'):
            pirate_current = pirate_data['current']
            openmeteo_current = blended.get('current', {})

            # Blend current conditions - prefer PirateWeather for real-time data
            blended_current = {
                # Real-time conditions from PirateWeather
                'temperature': pirate_current.get(
                    'temperature', openmeteo_current.get('temperature', 0)
                ),
                'feels_like': pirate_current.get(
                    'feels_like', openmeteo_current.get('feels_like', 0)
                ),
                'precipitation_rate': pirate_current.get(
                    'precipitation_rate', openmeteo_current.get('precipitation_rate', 0)
                ),
                'precipitation_prob': pirate_current.get(
                    'precipitation_prob', openmeteo_current.get('precipitation_prob', 0)
                ),
                'precipitation_type': pirate_current.get('precipitation_type')
                or openmeteo_current.get('precipitation_type'),
                'summary': pirate_current.get(
                    'summary', openmeteo_current.get('summary', 'Unknown')
                ),
                'icon': pirate_current.get(
                    'icon', openmeteo_current.get('icon', 'clear-day')
                ),
                'visibility': pirate_current.get('visibility', 10.0),
                # Enhanced data from OpenMeteo (more reliable for these)
                'pressure': openmeteo_current.get(
                    'pressure', pirate_current.get('pressure', 0)
                ),
                'dew_point': openmeteo_current.get('dew_point', 0),
                'uv_index': openmeteo_current.get(
                    'uv_index', pirate_current.get('uv_index', 0)
                ),
                'is_day': openmeteo_current.get(
                    'is_day', pirate_current.get('is_day', True)
                ),
                # Blend precipitation detection (use any source that shows rain)
                'rain_rate': max(
                    openmeteo_current.get('rain_rate', 0),
                    pirate_current.get('precipitation_rate', 0)
                    if pirate_current.get('precipitation_type') == 'rain'
                    else 0,
                ),
                'shower_rate': openmeteo_current.get('shower_rate', 0),
                'snow_rate': max(
                    openmeteo_current.get('snow_rate', 0),
                    pirate_current.get('precipitation_rate', 0)
                    if pirate_current.get('precipitation_type') == 'snow'
                    else 0,
                ),
                # Metadata
                'data_age': pirate_current.get('data_age', 0),
                'timestamp': pirate_current.get('timestamp', 0),
                # Use the rest from either source
                'humidity': pirate_current.get(
                    'humidity', openmeteo_current.get('humidity', 0)
                ),
                'wind_speed': pirate_current.get(
                    'wind_speed', openmeteo_current.get('wind_speed', 0)
                ),
            }

            blended['current'] = blended_current
            data_age = blended_current.get('data_age', 0)
            blend_msg = f'Blended PirateWeather + OpenMeteo (age: {data_age}min)'
            print(f'🔀 {blend_msg}')

        # Keep OpenMeteo's forecasts (they're excellent)
        # Keep OpenMeteo's minutely data (15-min precipitation)

        # Add provider info
        blended['provider'] = 'Hybrid (PirateWeather + OpenMeteo)'
        blended['location'] = location_name or 'Unknown Location'

        return blended


# AQI threshold constants
AQI_GOOD = 50
AQI_MODERATE = 100
AQI_UNHEALTHY_SENSITIVE = 150
AQI_UNHEALTHY = 200
AQI_VERY_UNHEALTHY = 300


class AirQualityProvider(WeatherProvider):
    """EPA AirNow API for official, accurate air quality index data"""

    def __init__(self, api_key: str):
        super().__init__('AirQuality')
        self.api_key = api_key  # Required for AirNow API
        self.base_url = 'http://www.airnowapi.org/aq/observation'

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict[str, Any] | None:
        """Fetch air quality data from EPA AirNow API"""
        try:
            # Try latitude/longitude endpoint first
            lat_lon_url = f'{self.base_url}/latLong/current/'
            params = {
                'format': 'application/json',
                'latitude': str(lat),
                'longitude': str(lon),
                'distance': '25',  # 25 mile radius
                'API_KEY': self.api_key,
            }

            response = requests.get(lat_lon_url, params=params, timeout=self.timeout)
            print(f'🌬️  AirNow API URL: {response.url}')
            response.raise_for_status()

            data: list[dict[str, Any]] = response.json()
            if data:  # If we got data, return it
                return {'observations': data}

            # If no data by coordinates, try to find a nearby zip code as fallback
            print('🌬️  No AirNow data by coordinates, trying zip code lookup fallback')
            return self._try_zip_code_fallback(lat, lon)

        except Exception as e:
            print(f'❌ AirNow API error: {str(e)}')
            return None

    def process_weather_data(
        self,
        raw_data: dict[str, Any],
        location_name: str | None = None,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Process EPA AirNow API response to extract AQI data"""
        if not raw_data:
            print('❌ No AirNow data available for this location')
            return None

        try:
            # Extract observations from wrapped data structure
            observations: list[dict[str, Any]] = raw_data.get('observations', [])

            if not observations:
                print('❌ No AirNow observations found in area')
                return None

            # Process AirNow observations - find highest AQI from available pollutants
            highest_aqi = 0
            primary_pollutant = None
            reporting_area = location_name
            pollutant_data = {}

            for obs in observations:
                parameter = obs.get('ParameterName', '')
                aqi = obs.get('AQI', 0)

                # Store pollutant data
                pollutant_data[parameter] = aqi

                # Track highest AQI (this is the overall AQI)
                if aqi > highest_aqi:
                    highest_aqi = aqi
                    primary_pollutant = parameter

                # Use reporting area from API if available
                if not reporting_area or reporting_area == 'Unknown Location':
                    reporting_area = obs.get('ReportingArea', location_name)

            if highest_aqi == 0:
                print('❌ No valid AQI readings from AirNow')
                return None

            return {
                'aqi': {
                    'us_aqi': highest_aqi,
                    'category': self._get_aqi_category(highest_aqi),
                    'health_recommendation': self._get_health_recommendation(
                        highest_aqi
                    ),
                    'color': self._get_aqi_color(highest_aqi),
                    'primary_pollutant': primary_pollutant,
                },
                'pollutants': {
                    'pm25': pollutant_data.get('PM2.5', 0),
                    'pm10': pollutant_data.get('PM10', 0),
                    'o3': pollutant_data.get('O3', 0),
                    'no2': pollutant_data.get('NO2', 0),
                    'so2': pollutant_data.get('SO2', 0),
                    'co': pollutant_data.get('CO', 0),
                },
                'observation_count': len(observations),
                'location': reporting_area or location_name or 'Unknown Location',
                'provider': f'{self.name} (EPA AirNow)',
            }

        except Exception as e:
            print(f'❌ Error processing AirNow data: {str(e)}')
            return None

    def _try_zip_code_fallback(self, lat: float, lon: float) -> dict[str, Any] | None:
        """Try to get data using a nearby zip code as fallback"""
        # This is a simplified fallback - in a real implementation, you'd use a
        # geocoding service to convert coordinates to zip codes
        # For now, we'll just return None to indicate no fallback data
        print(f'🌬️  Zip code fallback not implemented for lat={lat}, lon={lon}')
        return None

    def _get_aqi_category(self, aqi: int) -> str:
        """Get AQI category name"""
        if aqi <= AQI_GOOD:
            return 'Good'
        if aqi <= AQI_MODERATE:
            return 'Moderate'
        if aqi <= AQI_UNHEALTHY_SENSITIVE:
            return 'Unhealthy for Sensitive Groups'
        if aqi <= AQI_UNHEALTHY:
            return 'Unhealthy'
        if aqi <= AQI_VERY_UNHEALTHY:
            return 'Very Unhealthy'
        return 'Hazardous'

    def _get_health_recommendation(self, aqi: int) -> str:
        """Get health recommendation based on AQI"""
        if aqi <= AQI_GOOD:
            return 'Air quality is satisfactory for most people'
        if aqi <= AQI_MODERATE:
            return 'Sensitive individuals may experience minor symptoms'
        if aqi <= AQI_UNHEALTHY_SENSITIVE:
            return 'Sensitive groups should reduce outdoor activities'
        if aqi <= AQI_UNHEALTHY:
            return 'Everyone should limit outdoor activities'
        if aqi <= AQI_VERY_UNHEALTHY:
            return 'Avoid outdoor activities; stay indoors'
        return 'Emergency conditions - avoid all outdoor activities'

    def _get_aqi_color(self, aqi: int) -> str:
        """Get color code for AQI visualization"""
        if aqi <= AQI_GOOD:
            return '#00e400'  # Green
        if aqi <= AQI_MODERATE:
            return '#ffff00'  # Yellow
        if aqi <= AQI_UNHEALTHY_SENSITIVE:
            return '#ff7e00'  # Orange
        if aqi <= AQI_UNHEALTHY:
            return '#ff0000'  # Red
        if aqi <= AQI_VERY_UNHEALTHY:
            return '#99004c'  # Purple
        return '#7e0023'  # Maroon


class RadarProvider(WeatherProvider):
    """OpenWeatherMap radar tiles provider for precipitation visualization"""

    def __init__(self, api_key: str) -> None:
        super().__init__('RadarProvider')
        self.api_key = api_key
        self.base_url = 'https://maps.openweathermap.org/maps/2.0/radar'
        self.tile_size = 256

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Fetch radar tile URLs and timestamps for animation"""
        try:
            # Get available timestamps for radar animation
            timestamps_url = 'https://api.openweathermap.org/data/2.5/onecall'
            params: dict[str, str | float] = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'exclude': 'minutely,daily,alerts',
                'units': 'imperial',
            }

            # First get basic weather data to ensure API key works
            response = requests.get(timestamps_url, params=params, timeout=self.timeout)

            if response.status_code == 401:  # noqa: PLR2004
                print('❌ OpenWeatherMap API key invalid for radar')
                return None
            if response.status_code != 200:  # noqa: PLR2004
                print(f'❌ OpenWeatherMap API returned {response.status_code}')
                return None

            weather_data = response.json()
            current_time = weather_data.get('current', {}).get('dt', int(time.time()))

            # Generate radar tile URLs for animation (2 hours back + 1 hour forward)
            # OpenWeatherMap provides tiles at 10-minute intervals
            timestamps = []
            tile_urls = []

            # Historical frames (12 frames = 2 hours at 10-minute intervals)
            for i in range(12, 0, -1):
                timestamp = current_time - (i * 600)  # 600 seconds = 10 minutes
                timestamps.append(timestamp)

            # Current frame
            timestamps.append(current_time)

            # Forecast frames (6 frames = 1 hour at 10-minute intervals)
            for i in range(1, 7):
                timestamp = current_time + (i * 600)
                timestamps.append(timestamp)

            # Calculate zoom level and tile coordinates for the location
            zoom_levels = [6, 8, 10]  # Regional, local, detailed

            for zoom in zoom_levels:
                level_tiles = []
                for timestamp in timestamps:
                    # Calculate tile coordinates for this lat/lon at this zoom level
                    tile_x, tile_y = self._lat_lon_to_tile(lat, lon, zoom)

                    # Generate tile URLs for radar data
                    tile_url = (
                        f'{self.base_url}/{zoom}/{tile_x}/{tile_y}'
                        f'?appid={self.api_key}&date={timestamp}'
                    )
                    level_tiles.append(
                        {
                            'url': tile_url,
                            'timestamp': timestamp,
                            'x': tile_x,
                            'y': tile_y,
                        }
                    )

                tile_urls.append({'zoom': zoom, 'tiles': level_tiles})

            print(
                f'🌧️  Radar: Generated {len(timestamps)} frames for '
                f'{len(zoom_levels)} zoom levels'
            )

            return {
                'timestamps': timestamps,
                'tile_urls': tile_urls,
                'current_time': current_time,
                'zoom_levels': zoom_levels,
                'center_lat': lat,
                'center_lon': lon,
                'weather_context': {
                    'temperature': weather_data.get('current', {}).get('temp'),
                    'precipitation': weather_data.get('current', {})
                    .get('rain', {})
                    .get('1h', 0),
                    'description': weather_data.get('current', {})
                    .get('weather', [{}])[0]
                    .get('description', ''),
                },
            }

        except Exception as e:
            print(f'❌ Radar API error: {str(e)}')
            return None

    def _lat_lon_to_tile(self, lat: float, lon: float, zoom: int) -> tuple[int, int]:
        """Convert latitude/longitude to tile coordinates at given zoom level"""
        import math

        lat_rad = math.radians(lat)
        n = 2.0**zoom
        tile_x = int((lon + 180.0) / 360.0 * n)
        tile_y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)

        return tile_x, tile_y

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Process radar data into standardized format for frontend"""
        if not raw_data:
            return None

        try:
            timestamps = raw_data.get('timestamps', [])
            tile_urls = raw_data.get('tile_urls', [])
            current_time = raw_data.get('current_time')
            weather_context = raw_data.get('weather_context', {})

            # Calculate animation metadata
            total_frames = len(timestamps)

            # Find current time in timestamps to properly count historical frames
            current_frame_index = 0
            if current_time:
                for i, timestamp in enumerate(timestamps):
                    if timestamp <= current_time:
                        current_frame_index = i
                    else:
                        break

            historical_frames = current_frame_index
            forecast_frames = max(
                0, total_frames - historical_frames - 1
            )  # -1 for current

            # Determine default zoom level (medium resolution for balance)
            default_zoom = 8
            default_tiles = None
            for level in tile_urls:
                if level['zoom'] == default_zoom:
                    default_tiles = level['tiles']
                    break

            if not default_tiles and tile_urls:
                default_tiles = tile_urls[0]['tiles']  # Fallback to first available

            processed_data = {
                'provider': self.name,
                'location_name': location_name,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'radar': {
                    'timestamps': timestamps,
                    'tile_levels': tile_urls,
                    'default_tiles': default_tiles,
                    'animation_metadata': {
                        'total_frames': total_frames,
                        'historical_frames': historical_frames,
                        'current_frame': current_frame_index,  # Index of current time
                        'forecast_frames': forecast_frames,
                        'interval_minutes': 10,
                        'duration_hours': total_frames * 10 / 60,
                    },
                    'map_bounds': {
                        'center_lat': raw_data.get('center_lat'),
                        'center_lon': raw_data.get('center_lon'),
                        'zoom_levels': raw_data.get('zoom_levels', []),
                    },
                },
                'weather_context': weather_context,
            }

            print(
                f'🌦️  Processed radar: {total_frames} frames, '
                f'{historical_frames}h history + {forecast_frames/6:.1f}h forecast'
            )

        except Exception as e:
            print(f'❌ Radar data processing error: {str(e)}')
            return None
        else:
            return processed_data


class ClothingRecommendationProvider(WeatherProvider):
    """Smart clothing recommendations based on weather conditions and forecasts"""

    def __init__(self) -> None:
        super().__init__('ClothingRecommendationProvider')

    def fetch_weather_data(
        self,
        lat: float,  # noqa: ARG002
        lon: float,  # noqa: ARG002
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """This provider processes existing weather data rather than fetching"""
        # This provider is designed to work with existing weather data
        return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Process weather data to generate clothing recommendations"""
        if not raw_data:
            return None

        try:
            current = raw_data.get('current', {})
            hourly = raw_data.get('hourly', [])
            daily = raw_data.get('daily', [])

            # Extract key weather parameters
            current_temp = current.get('temperature', 70)
            feels_like = current.get('feels_like', current_temp)
            humidity = current.get('humidity', 50)
            wind_speed = current.get('wind_speed', 0)
            precipitation_prob = current.get('precipitation_prob', 0)
            uv_index = current.get('uv_index', 0)

            # Get today's temperature range
            temp_high = current_temp
            temp_low = current_temp
            if daily:
                today = daily[0] if daily else {}
                temp_high = today.get('h', current_temp)
                temp_low = today.get('l', current_temp)

            # Analyze next 12 hours for changes
            next_12h_temps = []
            next_12h_precip = []
            if hourly:
                for hour in hourly[:12]:
                    next_12h_temps.append(hour.get('temp', current_temp))
                    next_12h_precip.append(hour.get('rain', 0))

            # Generate recommendations
            recommendations = self._generate_clothing_recommendations(
                current_temp=current_temp,
                feels_like=feels_like,
                temp_high=temp_high,
                temp_low=temp_low,
                humidity=humidity,
                wind_speed=wind_speed,
                precipitation_prob=precipitation_prob,
                uv_index=uv_index,
                next_12h_temps=next_12h_temps,
                next_12h_precip=next_12h_precip,
            )

            return {
                'provider': self.name,
                'location_name': location_name,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'clothing': {
                    'recommendations': recommendations,
                    'weather_context': {
                        'current_temp': current_temp,
                        'feels_like': feels_like,
                        'temp_range': {'high': temp_high, 'low': temp_low},
                        'conditions': {
                            'humidity': humidity,
                            'wind_speed': wind_speed,
                            'precipitation_prob': precipitation_prob,
                            'uv_index': uv_index,
                        },
                    },
                },
            }

        except Exception as e:
            print(f'❌ Clothing recommendation error: {str(e)}')
            return None

    def _generate_clothing_recommendations(  # noqa: PLR0915
        self,
        current_temp: float,
        feels_like: float,
        temp_high: float,
        temp_low: float,
        humidity: float,
        wind_speed: float,
        precipitation_prob: float,
        uv_index: float,
        next_12h_temps: list[float],  # noqa: ARG002
        next_12h_precip: list[float],
    ) -> dict:
        """Generate specific clothing recommendations based on weather analysis"""
        # Temperature thresholds for clothing recommendations
        very_hot_temp = 85  # Very hot weather threshold
        hot_temp = 75  # Hot weather threshold
        warm_temp = 65  # Warm weather threshold
        cool_temp = 50  # Cool weather threshold
        cold_temp = 35  # Cold weather threshold
        windy_threshold = 15  # Wind speed threshold for wind protection
        high_precip_prob = 60  # Precipitation probability threshold
        light_precip = 0.1  # Light precipitation threshold
        high_uv_threshold = 8  # High UV index threshold
        moderate_uv_threshold = 6  # Moderate UV index threshold
        low_uv_threshold = 3  # Low UV index threshold
        very_hot_humidity = 80  # Very hot humidity threshold
        optimal_humidity = 70  # Optimal humidity threshold
        low_humidity = 30  # Low humidity threshold
        very_high_temp = 80  # Very high temperature threshold
        freezing_temp = 32  # Freezing temperature threshold
        cold_wind_threshold = 20  # Cold weather wind threshold
        winter_wind_threshold = 15  # Winter wind threshold

        recommendations: dict[str, Any] = {
            'primary_suggestion': '',
            'items': [],
            'warnings': [],
            'comfort_tips': [],
            'activity_specific': {},
        }

        # Temperature-based base layer recommendations
        if feels_like >= very_hot_temp:
            base_layer = 'Light, breathable fabrics'
            recommendations['items'].extend(['shorts', 't-shirt', 'sandals'])
        elif feels_like >= hot_temp:
            base_layer = 'Lightweight clothing'
            recommendations['items'].extend(
                ['light pants', 'short sleeves', 'comfortable shoes']
            )
        elif feels_like >= warm_temp:
            base_layer = 'Comfortable casual wear'
            recommendations['items'].extend(['pants', 'long sleeves', 'closed shoes'])
        elif feels_like >= cool_temp:
            base_layer = 'Layers recommended'
            recommendations['items'].extend(['pants', 'light sweater', 'jacket'])
        elif feels_like >= cold_temp:
            base_layer = 'Warm clothing needed'
            recommendations['items'].extend(
                ['warm pants', 'sweater', 'coat', 'warm shoes']
            )
        else:
            base_layer = 'Heavy winter clothing'
            recommendations['items'].extend(
                ['insulated pants', 'heavy coat', 'warm layers', 'winter boots']
            )

        # Wind adjustments
        if wind_speed > windy_threshold:
            recommendations['items'].append('wind-resistant outer layer')
            recommendations['warnings'].append(
                f'Strong winds ({wind_speed} mph) - wind-resistant clothing recommended'
            )

        # Precipitation adjustments
        if precipitation_prob > high_precip_prob or any(
            p > light_precip for p in next_12h_precip
        ):
            recommendations['items'].extend(['waterproof jacket', 'umbrella'])
            recommendations['warnings'].append(
                f'Rain likely ({precipitation_prob}%) - bring rain protection'
            )
        elif precipitation_prob > low_humidity:
            recommendations['comfort_tips'].append(
                'Consider bringing an umbrella just in case'
            )

        # UV protection
        if uv_index >= high_uv_threshold:
            recommendations['items'].extend(['sunscreen', 'hat', 'sunglasses'])
            recommendations['warnings'].append(
                f'High UV index ({uv_index}) - sun protection essential'
            )
        elif uv_index >= moderate_uv_threshold:
            recommendations['items'].extend(['sunscreen', 'hat'])
            recommendations['comfort_tips'].append(
                'Moderate UV - sun protection recommended'
            )
        elif uv_index >= low_uv_threshold:
            recommendations['comfort_tips'].append(
                'Some sun protection advised during peak hours'
            )

        # Temperature swing analysis
        temp_swing = temp_high - temp_low
        if temp_swing > cold_wind_threshold:
            recommendations['warnings'].append(
                f'Large temperature swing ({temp_swing:.0f}°) - dress in layers'
            )
            recommendations['items'].append('layering pieces')
        elif temp_swing > winter_wind_threshold:
            recommendations['comfort_tips'].append(
                'Temperature will change - consider layering'
            )

        # Humidity comfort
        if humidity > very_hot_humidity and current_temp > optimal_humidity:
            recommendations['comfort_tips'].append(
                'High humidity - choose breathable fabrics'
            )
        elif humidity < low_humidity:
            recommendations['comfort_tips'].append(
                'Low humidity - consider moisturizer'
            )

        # Generate primary suggestion
        if feels_like >= very_high_temp:
            recommendations['primary_suggestion'] = (
                f'{base_layer} - stay cool and hydrated'
            )
        elif feels_like <= freezing_temp:
            recommendations['primary_suggestion'] = (
                f'{base_layer} - bundle up and stay warm'
            )
        elif temp_swing > winter_wind_threshold:
            recommendations['primary_suggestion'] = (
                f'{base_layer} - dress in removable layers'
            )
        elif precipitation_prob > cool_temp:
            recommendations['primary_suggestion'] = f'{base_layer} with rain protection'
        else:
            recommendations['primary_suggestion'] = base_layer

        # Activity-specific recommendations
        recommendations['activity_specific'] = {
            'commuting': self._get_commute_recommendations(
                feels_like, wind_speed, precipitation_prob
            ),
            'exercise': self._get_exercise_recommendations(
                feels_like, humidity, uv_index
            ),
            'outdoor_work': self._get_outdoor_work_recommendations(
                feels_like, wind_speed, uv_index, precipitation_prob
            ),
        }

        return recommendations

    def _get_commute_recommendations(
        self, feels_like: float, wind_speed: float, precipitation_prob: float
    ) -> str:
        """Generate commute-specific recommendations"""
        cold_weather_threshold = 40
        hot_weather_threshold = 80
        high_wind_threshold = 20
        high_precip_threshold = 40

        suggestions = []

        if feels_like < cold_weather_threshold:
            suggestions.append('warm coat and gloves')
        elif feels_like > hot_weather_threshold:
            suggestions.append('light layers you can remove indoors')

        if wind_speed > high_wind_threshold:
            suggestions.append('secure any loose items')

        if precipitation_prob > high_precip_threshold:
            suggestions.append('waterproof shoes and jacket')

        if not suggestions:
            suggestions.append('standard work attire should be comfortable')

        return ', '.join(suggestions)

    def _get_exercise_recommendations(
        self, feels_like: float, humidity: float, uv_index: float
    ) -> str:
        """Generate exercise-specific recommendations"""
        exercise_hot_temp = 75
        exercise_high_humidity = 70
        exercise_uv_threshold = 6
        exercise_cool_temp = 45

        suggestions = []

        if feels_like > exercise_hot_temp:
            suggestions.append('moisture-wicking fabrics')
        if humidity > exercise_high_humidity:
            suggestions.append('extra hydration')
        if uv_index >= exercise_uv_threshold:
            suggestions.append('sun protection and early/late timing')
        if feels_like < exercise_cool_temp:
            suggestions.append('warm-up layers you can remove')

        if not suggestions:
            suggestions.append('standard workout gear should work well')

        return ', '.join(suggestions)

    def _get_outdoor_work_recommendations(
        self,
        feels_like: float,
        wind_speed: float,
        uv_index: float,
        precipitation_prob: float,
    ) -> str:
        """Generate outdoor work recommendations"""
        # Temperature thresholds for outdoor work safety
        outdoor_work_hot_temp = 85  # Temperature requiring cooling gear
        outdoor_work_cold_temp = 32  # Temperature requiring insulated gear
        high_wind_work_threshold = 25  # Wind speed requiring equipment securing
        high_uv_work_threshold = 7  # UV index requiring sun protection
        work_rain_threshold = 30  # Precipitation probability requiring waterproof gear

        suggestions = []

        if feels_like > outdoor_work_hot_temp:
            suggestions.append('frequent shade breaks and cooling gear')
        elif feels_like < outdoor_work_cold_temp:
            suggestions.append('insulated work gear and hand warmers')

        if wind_speed > high_wind_work_threshold:
            suggestions.append('secure all equipment and materials')

        if uv_index >= high_uv_work_threshold:
            suggestions.append('long sleeves, hat, and frequent sunscreen')

        if precipitation_prob > work_rain_threshold:
            suggestions.append('waterproof work gear')

        if not suggestions:
            suggestions.append('standard work clothing appropriate')

        return ', '.join(suggestions)


class SolarDataProvider(WeatherProvider):
    """Solar data provider for sunrise, sunset, and astronomical calculations"""

    def __init__(self) -> None:
        super().__init__('SolarDataProvider')

    def fetch_weather_data(
        self,
        lat: float,  # noqa: ARG002
        lon: float,  # noqa: ARG002
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """This provider calculates solar data rather than fetching from APIs"""
        # Solar calculations are done locally, no external API needed
        return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Process location and date info to calculate solar data"""
        if not raw_data or 'lat' not in raw_data or 'lon' not in raw_data:
            return None

        try:
            lat = raw_data['lat']
            lon = raw_data['lon']
            date_str = raw_data.get('date')

            # Use provided timezone or default to UTC
            if tz_name:
                try:
                    import zoneinfo

                    timezone_obj = zoneinfo.ZoneInfo(tz_name)
                except (ImportError, Exception):
                    timezone_obj = timezone.utc  # type: ignore[assignment]
            else:
                timezone_obj = timezone.utc  # type: ignore[assignment]

            # Use provided date or current date
            if date_str:
                target_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                target_date = datetime.now(timezone_obj)

            # Ensure target_date is timezone-aware
            if target_date.tzinfo is None:
                target_date = target_date.replace(tzinfo=timezone_obj)

            # Calculate solar data
            solar_data = self._calculate_solar_times(lat, lon, target_date)

            return {
                'provider': self.name,
                'location_name': location_name,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'solar': {
                    **solar_data,
                    'location': {
                        'latitude': lat,
                        'longitude': lon,
                        'timezone': str(timezone_obj),
                    },
                },
            }

        except Exception as e:
            print(f'❌ Solar data calculation error: {str(e)}')
            return None

    def _calculate_solar_times(self, lat: float, lon: float, date: datetime) -> dict:
        """Calculate sunrise, sunset, and related solar data"""
        import math

        # Convert to UTC for calculations
        utc_date = (
            date.astimezone(timezone.utc)
            if date.tzinfo
            else date.replace(tzinfo=timezone.utc)
        )

        # Calculate day of year and solar declination
        day_of_year = utc_date.timetuple().tm_yday
        solar_declination = 23.45 * math.sin(
            math.radians(360 * (284 + day_of_year) / 365)
        )

        # Calculate equation of time (in minutes)
        equation_of_time = self._equation_of_time(day_of_year)

        # Calculate sunrise and sunset
        sunrise_utc, sunset_utc = self._calculate_sunrise_sunset(
            lat, lon, solar_declination, equation_of_time, utc_date
        )

        # Calculate solar noon
        solar_noon_utc = sunrise_utc + (sunset_utc - sunrise_utc) / 2

        # Calculate daylight duration
        daylight_duration = sunset_utc - sunrise_utc
        daylight_hours = daylight_duration.total_seconds() / 3600

        # Calculate golden hour and blue hour times
        golden_hour_morning_start = sunrise_utc - timedelta(minutes=30)
        golden_hour_morning_end = sunrise_utc + timedelta(minutes=30)
        golden_hour_evening_start = sunset_utc - timedelta(minutes=30)
        golden_hour_evening_end = sunset_utc + timedelta(minutes=30)

        blue_hour_morning_start = sunrise_utc - timedelta(minutes=60)
        blue_hour_morning_end = sunrise_utc - timedelta(minutes=20)
        blue_hour_evening_start = sunset_utc + timedelta(minutes=20)
        blue_hour_evening_end = sunset_utc + timedelta(minutes=60)

        # Calculate civil, nautical, and astronomical twilight
        civil_twilight_dawn = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -6
        )
        civil_twilight_dusk = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -6, is_dawn=False
        )

        nautical_twilight_dawn = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -12
        )
        nautical_twilight_dusk = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -12, is_dawn=False
        )

        astronomical_twilight_dawn = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -18
        )
        astronomical_twilight_dusk = self._calculate_twilight(
            lat, lon, solar_declination, equation_of_time, utc_date, -18, is_dawn=False
        )

        # Calculate current solar elevation
        current_solar_elevation = self._calculate_solar_elevation(lat, lon, utc_date)

        # Calculate progress through the day
        current_time = datetime.now(timezone.utc)
        if sunrise_utc <= current_time <= sunset_utc:
            # Daytime - calculate progress from sunrise to sunset
            time_since_sunrise = (current_time - sunrise_utc).total_seconds()
            total_daylight_seconds = daylight_duration.total_seconds()
            daylight_progress = (
                min(1.0, time_since_sunrise / total_daylight_seconds)
                if total_daylight_seconds > 0
                else 0
            )
            is_daylight = True
        else:
            # Nighttime
            daylight_progress = 0 if current_time < sunrise_utc else 1.0
            is_daylight = False

        # Calculate yesterday's and tomorrow's daylight duration for comparison
        yesterday = utc_date - timedelta(days=1)
        tomorrow = utc_date + timedelta(days=1)

        yesterday_solar_data = self._get_daylight_duration(lat, lon, yesterday)
        tomorrow_solar_data = self._get_daylight_duration(lat, lon, tomorrow)

        return {
            'times': {
                'sunrise': sunrise_utc.isoformat(),
                'sunset': sunset_utc.isoformat(),
                'solar_noon': solar_noon_utc.isoformat(),
                'civil_twilight_dawn': civil_twilight_dawn.isoformat()
                if civil_twilight_dawn
                else None,
                'civil_twilight_dusk': civil_twilight_dusk.isoformat()
                if civil_twilight_dusk
                else None,
                'nautical_twilight_dawn': nautical_twilight_dawn.isoformat()
                if nautical_twilight_dawn
                else None,
                'nautical_twilight_dusk': nautical_twilight_dusk.isoformat()
                if nautical_twilight_dusk
                else None,
                'astronomical_twilight_dawn': astronomical_twilight_dawn.isoformat()
                if astronomical_twilight_dawn
                else None,
                'astronomical_twilight_dusk': astronomical_twilight_dusk.isoformat()
                if astronomical_twilight_dusk
                else None,
            },
            'golden_hour': {
                'morning_start': golden_hour_morning_start.isoformat(),
                'morning_end': golden_hour_morning_end.isoformat(),
                'evening_start': golden_hour_evening_start.isoformat(),
                'evening_end': golden_hour_evening_end.isoformat(),
            },
            'blue_hour': {
                'morning_start': blue_hour_morning_start.isoformat(),
                'morning_end': blue_hour_morning_end.isoformat(),
                'evening_start': blue_hour_evening_start.isoformat(),
                'evening_end': blue_hour_evening_end.isoformat(),
            },
            'daylight': {
                'duration_hours': round(daylight_hours, 2),
                'duration_minutes': round(daylight_hours * 60),
                'progress': round(daylight_progress, 3),
                'is_daylight': is_daylight,
            },
            'solar_elevation': {
                'current_degrees': round(current_solar_elevation, 2),
                'is_above_horizon': current_solar_elevation > 0,
            },
            'comparisons': {
                'yesterday_duration_hours': round(yesterday_solar_data, 2),
                'tomorrow_duration_hours': round(tomorrow_solar_data, 2),
                'change_from_yesterday_minutes': round(
                    (daylight_hours - yesterday_solar_data) * 60, 1
                ),
                'change_to_tomorrow_minutes': round(
                    (tomorrow_solar_data - daylight_hours) * 60, 1
                ),
            },
        }

    def _equation_of_time(self, day_of_year: int) -> float:
        """Calculate equation of time in minutes"""
        import math

        b = 2 * math.pi * (day_of_year - 81) / 365
        return 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)

    def _calculate_sunrise_sunset(
        self,
        lat: float,
        lon: float,
        solar_declination: float,
        equation_of_time: float,
        date: datetime,
    ) -> tuple[datetime, datetime]:
        """Calculate sunrise and sunset times"""
        import math

        # Calculate hour angle
        lat_rad = math.radians(lat)
        declination_rad = math.radians(solar_declination)

        try:
            hour_angle = math.acos(-math.tan(lat_rad) * math.tan(declination_rad))
            hour_angle_degrees = math.degrees(hour_angle)
        except ValueError:
            # Polar day or polar night
            hour_angle_degrees = 180 if lat * solar_declination > 0 else 0

        # Calculate solar times in UTC
        solar_noon_time = 12 - (lon / 15) - (equation_of_time / 60)
        sunrise_time = solar_noon_time - (hour_angle_degrees / 15)
        sunset_time = solar_noon_time + (hour_angle_degrees / 15)

        # Convert to datetime objects
        base_date = date.replace(hour=0, minute=0, second=0, microsecond=0)

        sunrise_utc = base_date + timedelta(hours=sunrise_time)
        sunset_utc = base_date + timedelta(hours=sunset_time)

        return sunrise_utc, sunset_utc

    def _calculate_twilight(
        self,
        lat: float,
        lon: float,
        solar_declination: float,
        equation_of_time: float,
        date: datetime,
        sun_angle: float,
        is_dawn: bool = True,
    ) -> datetime | None:
        """Calculate twilight times (civil, nautical, astronomical)"""
        import math

        lat_rad = math.radians(lat)
        declination_rad = math.radians(solar_declination)
        sun_angle_rad = math.radians(sun_angle)

        try:
            hour_angle = math.acos(
                (
                    math.sin(sun_angle_rad)
                    - math.sin(lat_rad) * math.sin(declination_rad)
                )
                / (math.cos(lat_rad) * math.cos(declination_rad))
            )
            hour_angle_degrees = math.degrees(hour_angle)
        except ValueError:
            # No twilight at this location/date
            return None

        solar_noon_time = 12 - (lon / 15) - (equation_of_time / 60)

        if is_dawn:
            twilight_time = solar_noon_time - (hour_angle_degrees / 15)
        else:
            twilight_time = solar_noon_time + (hour_angle_degrees / 15)

        base_date = date.replace(hour=0, minute=0, second=0, microsecond=0)
        return base_date + timedelta(hours=twilight_time)

    def _calculate_solar_elevation(
        self, lat: float, lon: float, date: datetime
    ) -> float:
        """Calculate current solar elevation angle"""
        import math

        # Calculate solar declination for current date
        day_of_year = date.timetuple().tm_yday
        solar_declination = 23.45 * math.sin(
            math.radians(360 * (284 + day_of_year) / 365)
        )

        # Calculate equation of time
        equation_of_time = self._equation_of_time(day_of_year)

        # Calculate hour angle
        solar_time = date.hour + date.minute / 60.0 + date.second / 3600.0
        solar_noon_time = 12 - (lon / 15) - (equation_of_time / 60)
        hour_angle = 15 * (solar_time - solar_noon_time)

        # Calculate solar elevation
        lat_rad = math.radians(lat)
        declination_rad = math.radians(solar_declination)
        hour_angle_rad = math.radians(hour_angle)

        elevation_rad = math.asin(
            math.sin(lat_rad) * math.sin(declination_rad)
            + math.cos(lat_rad) * math.cos(declination_rad) * math.cos(hour_angle_rad)
        )

        return math.degrees(elevation_rad)

    def _get_daylight_duration(self, lat: float, lon: float, date: datetime) -> float:
        """Get daylight duration in hours for a specific date"""
        try:
            day_of_year = date.timetuple().tm_yday
            solar_declination = 23.45 * math.sin(
                math.radians(360 * (284 + day_of_year) / 365)
            )
            equation_of_time = self._equation_of_time(day_of_year)

            sunrise, sunset = self._calculate_sunrise_sunset(
                lat, lon, solar_declination, equation_of_time, date
            )
            duration = sunset - sunrise
            return duration.total_seconds() / 3600
        except Exception:
            return 12.0  # Default to 12 hours if calculation fails


class NationalWeatherServiceProvider(WeatherProvider):
    """National Weather Service provider for official weather alerts and warnings"""

    def __init__(self) -> None:
        super().__init__('NationalWeatherService')
        self.base_url = 'https://api.weather.gov'
        self.user_agent = (
            'WeatherDashboard/1.0 (https://github.com/user/weather-dashboard)'
        )

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Fetch weather alerts and forecast data from NWS API"""
        try:
            headers = {'User-Agent': self.user_agent}

            # First, get the grid point for this location
            points_url = f'{self.base_url}/points/{lat:.4f},{lon:.4f}'
            points_response = requests.get(
                points_url, headers=headers, timeout=self.timeout
            )

            if points_response.status_code != 200:  # noqa: PLR2004
                print(f'❌ NWS points API returned {points_response.status_code}')
                return None

            points_data = points_response.json()
            properties = points_data.get('properties', {})

            # Extract grid info for forecast
            grid_office = properties.get('cwa')
            grid_x = properties.get('gridX')
            grid_y = properties.get('gridY')

            if not all([grid_office, grid_x, grid_y]):
                print('❌ Could not get NWS grid coordinates')
                return None

            # Get active alerts for this location
            alerts_url = f'{self.base_url}/alerts/active'
            alerts_params: dict[str, str | int] = {
                'point': f'{lat:.4f},{lon:.4f}',
                'status': 'actual',
                'limit': 20,
            }

            alerts_response = requests.get(
                alerts_url, params=alerts_params, headers=headers, timeout=self.timeout
            )

            alerts_data = None
            if alerts_response.status_code == 200:  # noqa: PLR2004
                alerts_data = alerts_response.json()
            else:
                print(f'⚠️  NWS alerts API returned {alerts_response.status_code}')

            # Get current conditions and forecast (optional)
            forecast_url = (
                f'{self.base_url}/gridpoints/{grid_office}/{grid_x},{grid_y}/forecast'
            )
            forecast_response = requests.get(
                forecast_url, headers=headers, timeout=self.timeout
            )

            forecast_data = None
            if forecast_response.status_code == 200:  # noqa: PLR2004
                forecast_data = forecast_response.json()
            else:
                print(f'⚠️  NWS forecast API returned {forecast_response.status_code}')

            print(f'🏛️  NWS API: Grid {grid_office}/{grid_x},{grid_y}')

        except Exception as e:
            print(f'❌ NWS API error: {str(e)}')
            return None
        else:
            return {
                'points': points_data,
                'alerts': alerts_data,
                'forecast': forecast_data,
                'grid_info': {'office': grid_office, 'x': grid_x, 'y': grid_y},
            }

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Process NWS data into standardized format focusing on alerts"""
        if not raw_data:
            return None

        try:
            alerts = raw_data.get('alerts', {})
            forecast = raw_data.get('forecast', {})

            # Process alerts
            processed_alerts = []
            alert_features = alerts.get('features', []) if alerts else []

            for alert_feature in alert_features:
                alert_props = alert_feature.get('properties', {})

                # Extract key alert information
                alert_info = {
                    'id': alert_props.get('id'),
                    'type': alert_props.get('event'),
                    'headline': alert_props.get('headline'),
                    'description': alert_props.get('description'),
                    'severity': alert_props.get('severity'),
                    'certainty': alert_props.get('certainty'),
                    'urgency': alert_props.get('urgency'),
                    'start_time': alert_props.get('onset'),
                    'end_time': alert_props.get('expires'),
                    'sender': alert_props.get('senderName'),
                    'areas': alert_props.get('areaDesc'),
                    'instruction': alert_props.get('instruction'),
                    'response': alert_props.get('response'),
                }

                # Add severity color coding
                severity = alert_props.get('severity', '').lower()
                if severity == 'extreme':
                    alert_info['color'] = '#8B0000'  # Dark red
                elif severity == 'severe':
                    alert_info['color'] = '#FF0000'  # Red
                elif severity == 'moderate':
                    alert_info['color'] = '#FF8C00'  # Dark orange
                elif severity == 'minor':
                    alert_info['color'] = '#FFD700'  # Gold
                else:
                    alert_info['color'] = '#1E90FF'  # Dodger blue

                processed_alerts.append(alert_info)

            # Process basic forecast if available
            forecast_periods: list[dict[str, str | int]] = []
            if forecast:
                periods = forecast.get('properties', {}).get('periods', [])
                forecast_periods.extend(
                    {
                        'name': period.get('name'),
                        'temperature': period.get('temperature'),
                        'temperature_unit': period.get('temperatureUnit'),
                        'wind_speed': period.get('windSpeed'),
                        'wind_direction': period.get('windDirection'),
                        'short_forecast': period.get('shortForecast'),
                        'detailed_forecast': period.get('detailedForecast'),
                        'is_daytime': period.get('isDaytime'),
                        'icon': period.get('icon'),
                    }
                    for period in periods[:7]  # Next 7 periods
                )

            # Create standardized response
            processed_data = {
                'provider': self.name,
                'location_name': location_name,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'alerts': {
                    'active_count': len(processed_alerts),
                    'alerts': processed_alerts,
                    'has_warnings': any(
                        alert.get('severity', '').lower() in ['extreme', 'severe']
                        for alert in processed_alerts
                    ),
                },
                'forecast': {
                    'periods': forecast_periods,
                    'source': 'National Weather Service',
                },
            }

            alert_count = len(processed_alerts)
            severity_info = []
            if processed_alerts:
                severities = [
                    alert.get('severity', 'Unknown') for alert in processed_alerts
                ]
                severity_counts: dict[str, int] = {}
                for sev in severities:
                    severity_counts[sev] = severity_counts.get(sev, 0) + 1
                severity_info = [
                    f'{count} {sev}' for sev, count in severity_counts.items()
                ]

            print(f'🚨 NWS Alerts: {alert_count} active ({", ".join(severity_info)})')

        except Exception as e:
            print(f'❌ NWS data processing error: {str(e)}')
            return None
        else:
            return processed_data


class EnhancedTemperatureTrendProvider(WeatherProvider):
    """Enhanced temperature trend provider with statistical analysis and calculations"""

    # Comfort categorization thresholds
    OPTIMAL_TEMP_MIN = 68
    OPTIMAL_TEMP_MAX = 72
    OPTIMAL_HUMIDITY_MIN = 30
    OPTIMAL_HUMIDITY_MAX = 60
    COMFORTABLE_TEMP_MIN = 65
    COMFORTABLE_TEMP_MAX = 75
    COMFORTABLE_HUMIDITY_MIN = 25
    COMFORTABLE_HUMIDITY_MAX = 70
    HOT_TEMP_THRESHOLD = 80
    HOT_HUMIDITY_THRESHOLD = 70
    COOL_TEMP_THRESHOLD = 60

    # Trend analysis constants
    WARMING_SLOPE_THRESHOLD = 0.5
    COOLING_SLOPE_THRESHOLD = -0.5
    MIN_DATA_POINTS_FOR_TREND = 6
    MIN_DATA_POINTS_FOR_STATS = 2
    HOURS_IN_24H = 24
    LAST_HOUR_INDEX = 23

    # Heat index calculation constants
    HEAT_INDEX_TEMP_MIN = 80
    HEAT_INDEX_TEMP_MAX = 112
    HEAT_INDEX_HUMIDITY_MIN = 40
    HEAT_INDEX_TEMP_ADJUSTMENT_LOWER = 80
    HEAT_INDEX_TEMP_ADJUSTMENT_UPPER = 87
    HEAT_INDEX_HUMIDITY_LOW = 13
    HEAT_INDEX_HUMIDITY_HIGH = 85
    HEAT_INDEX_TEMP_COMFORT = 95

    # Wind chill calculation constants
    WIND_CHILL_TEMP_MAX = 50
    WIND_CHILL_SPEED_MIN = 3

    # Confidence interval constants
    EXTREME_TEMP_HIGH = 90
    EXTREME_TEMP_LOW = 20

    # Simple comfort categories for analysis
    COMFORT_TEMP_MIN = 65
    COMFORT_TEMP_MAX = 75
    HOT_SIMPLE_THRESHOLD = 80
    COOL_TEMP_MIN = 50

    def __init__(self) -> None:
        super().__init__('EnhancedTemperatureTrendProvider')

    def fetch_weather_data(
        self,
        lat: float,  # noqa: ARG002
        lon: float,  # noqa: ARG002
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """This provider processes existing weather data rather than fetching"""
        # This provider is designed to work with existing weather data
        return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Process weather data to generate enhanced temperature trends"""
        if not raw_data:
            return None

        try:
            current = raw_data.get('current', {})
            hourly = raw_data.get('hourly', [])
            daily = raw_data.get('daily', [])

            # Extract key weather parameters
            current_temp = current.get('temperature', 70)
            current_humidity = current.get('humidity', 50)
            current_wind_speed = current.get('wind_speed', 0)
            current_dew_point = current.get('dew_point', 50)

            # Get next 48 hours of temperature and weather data
            next_48h_data = []
            if hourly:
                for i, hour in enumerate(hourly[:48]):
                    hour_temp = hour.get('temp', current_temp)
                    # Estimate humidity and wind speed for apparent temperature calcs
                    hour_humidity = current_humidity  # Use current as estimate
                    hour_wind_speed = current.get('wind_speed', current_wind_speed)

                    # Calculate apparent temperature (heat index or wind chill)
                    apparent_temp = self._calculate_apparent_temperature(
                        hour_temp, hour_humidity, hour_wind_speed
                    )

                    # Calculate confidence interval (increases with time)
                    confidence_interval = self._calculate_confidence_intervals(
                        i, hour_temp
                    )

                    next_48h_data.append(
                        {
                            'hour': i,
                            'time': hour.get('t', f'{i}h'),
                            'temperature': hour_temp,
                            'apparent_temperature': apparent_temp,
                            'confidence_lower': confidence_interval['lower'],
                            'confidence_upper': confidence_interval['upper'],
                            'uncertainty': confidence_interval['uncertainty'],
                            'pressure': hour.get('pressure', 0),
                        }
                    )

            # Calculate temperature statistics
            temp_stats = self._calculate_temperature_statistics(next_48h_data)

            # Analyze comfort zones
            comfort_analysis = self._analyze_comfort_zones(next_48h_data)

            # Analyze temperature trends
            trend_analysis = self._analyze_temperature_trends(next_48h_data)

            # Generate historical percentile estimates (simplified for now)
            percentile_bands = self._generate_percentile_bands(current_temp, daily)

            return {
                'provider': self.name,
                'location_name': location_name,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'temperature_trends': {
                    'hourly_data': next_48h_data,
                    'statistics': temp_stats,
                    'comfort_analysis': comfort_analysis,
                    'trend_analysis': trend_analysis,
                    'percentile_bands': percentile_bands,
                    'current': {
                        'temperature': current_temp,
                        'apparent_temperature': self._calculate_apparent_temperature(
                            current_temp, current_humidity, current_wind_speed
                        ),
                        'dew_point': current_dew_point,
                        'comfort_category': self._categorize_comfort(
                            current_temp, current_humidity
                        ),
                    },
                },
            }

        except Exception as e:
            print(f'❌ Enhanced temperature trend error: {str(e)}')
            return None

    def _calculate_apparent_temperature(
        self, temp: float, humidity: float, wind_speed: float
    ) -> float:
        """Calculate apparent temperature using heat index or wind chill"""
        # Use heat index for warm conditions (>= 80°F)
        if temp >= self.HEAT_INDEX_TEMP_MIN:
            return self._calculate_heat_index(temp, humidity)
        # Use wind chill for cold conditions (<= 50°F with wind)
        if temp <= self.WIND_CHILL_TEMP_MAX and wind_speed > self.WIND_CHILL_SPEED_MIN:
            return self._calculate_wind_chill(temp, wind_speed)
        # For moderate conditions, apparent temp ≈ actual temp
        return temp

    def _calculate_heat_index(self, temp: float, humidity: float) -> float:
        """Calculate heat index using the National Weather Service formula"""
        # Simplified heat index formula (Rothfusz regression)
        if temp < self.HEAT_INDEX_TEMP_MIN or humidity < self.HEAT_INDEX_HUMIDITY_MIN:
            return temp  # Heat index not applicable

        temp_f = temp
        humidity_pct = humidity

        # Full Rothfusz regression equation
        heat_index = (
            -42.379
            + 2.04901523 * temp_f
            + 10.14333127 * humidity_pct
            - 0.22475541 * temp_f * humidity_pct
            - 6.83783e-3 * temp_f * temp_f
            - 5.481717e-2 * humidity_pct * humidity_pct
            + 1.22874e-3 * temp_f * temp_f * humidity_pct
            + 8.5282e-4 * temp_f * humidity_pct * humidity_pct
            - 1.99e-6 * temp_f * temp_f * humidity_pct * humidity_pct
        )

        # Adjustments for extreme conditions
        if (
            humidity_pct <= self.HEAT_INDEX_HUMIDITY_LOW
            and self.HEAT_INDEX_TEMP_MIN <= temp_f <= self.HEAT_INDEX_TEMP_MAX
        ):
            adjustment = (self.HEAT_INDEX_HUMIDITY_LOW - humidity_pct) / 4
            temp_diff = abs(temp_f - self.HEAT_INDEX_TEMP_COMFORT)
            heat_index -= adjustment * math.sqrt((17 - temp_diff) / 17)
        elif (
            humidity_pct > self.HEAT_INDEX_HUMIDITY_HIGH
            and self.HEAT_INDEX_TEMP_ADJUSTMENT_LOWER
            <= temp_f
            <= self.HEAT_INDEX_TEMP_ADJUSTMENT_UPPER
        ):
            heat_index += ((humidity_pct - self.HEAT_INDEX_HUMIDITY_HIGH) / 10) * (
                (self.HEAT_INDEX_TEMP_ADJUSTMENT_UPPER - temp_f) / 5
            )

        return round(heat_index, 1)

    def _calculate_wind_chill(self, temp: float, wind_speed: float) -> float:
        """Calculate wind chill using the National Weather Service formula"""
        if temp > self.WIND_CHILL_TEMP_MAX or wind_speed <= self.WIND_CHILL_SPEED_MIN:
            return temp  # Wind chill not applicable

        # NWS wind chill formula (valid for temps ≤ 50°F and wind ≥ 3 mph)
        wind_chill = (
            35.74
            + 0.6215 * temp
            - 35.75 * (wind_speed**0.16)
            + 0.4275 * temp * (wind_speed**0.16)
        )

        return float(round(wind_chill, 1))

    def _calculate_confidence_intervals(
        self, hour_index: int, temperature: float
    ) -> dict:
        """Calculate confidence intervals with increasing uncertainty over time"""
        # Uncertainty increases with forecast time
        base_uncertainty = 1.0  # ±1°F for current conditions
        time_multiplier = math.sqrt(hour_index / 6)  # Increases with time
        forecast_uncertainty = base_uncertainty * (1 + time_multiplier)

        # Additional uncertainty for extreme temperatures
        temp_uncertainty = 0.0
        if temperature > self.EXTREME_TEMP_HIGH or temperature < self.EXTREME_TEMP_LOW:
            temp_uncertainty = 0.5

        total_uncertainty = forecast_uncertainty + temp_uncertainty

        return {
            'lower': temperature - total_uncertainty,
            'upper': temperature + total_uncertainty,
            'uncertainty': round(total_uncertainty, 1),
        }

    def _analyze_comfort_zones(self, hourly_data: list[dict]) -> dict:
        """Analyze comfort zones throughout the forecast period"""
        comfort_categories = {'comfortable': 0, 'hot': 0, 'cool': 0, 'cold': 0}

        for hour_data in hourly_data:
            temp = hour_data['temperature']
            # Simplified comfort analysis based on temperature
            if self.COMFORT_TEMP_MIN <= temp <= self.COMFORT_TEMP_MAX:
                comfort_categories['comfortable'] += 1
            elif temp > self.HOT_SIMPLE_THRESHOLD:
                comfort_categories['hot'] += 1
            elif self.COOL_TEMP_MIN <= temp < self.COMFORT_TEMP_MIN:
                comfort_categories['cool'] += 1
            else:
                comfort_categories['cold'] += 1

        total_hours = len(hourly_data)
        if total_hours == 0:
            return comfort_categories

        return {
            'categories': comfort_categories,
            'percentages': {
                category: round((count / total_hours) * 100, 1)
                for category, count in comfort_categories.items()
            },
            'primary_comfort': max(
                comfort_categories, key=lambda x: comfort_categories[x]
            ),
        }

    def _categorize_comfort(self, temp: float, humidity: float) -> str:
        """Categorize comfort level based on temperature and humidity"""
        if (
            self.OPTIMAL_TEMP_MIN <= temp <= self.OPTIMAL_TEMP_MAX
            and self.OPTIMAL_HUMIDITY_MIN <= humidity <= self.OPTIMAL_HUMIDITY_MAX
        ):
            return 'optimal'
        if (
            self.COMFORTABLE_TEMP_MIN <= temp <= self.COMFORTABLE_TEMP_MAX
            and self.COMFORTABLE_HUMIDITY_MIN
            <= humidity
            <= self.COMFORTABLE_HUMIDITY_MAX
        ):
            return 'comfortable'
        if temp > self.HOT_TEMP_THRESHOLD or humidity > self.HOT_HUMIDITY_THRESHOLD:
            return 'hot'
        if temp < self.COOL_TEMP_THRESHOLD:
            return 'cool'
        return 'moderate'

    def _calculate_temperature_statistics(self, hourly_data: list[dict]) -> dict:
        """Calculate comprehensive temperature statistics"""
        if not hourly_data:
            return {}

        temperatures = [hour['temperature'] for hour in hourly_data]
        apparent_temps = [hour['apparent_temperature'] for hour in hourly_data]

        return {
            'temperature': {
                'min': min(temperatures),
                'max': max(temperatures),
                'mean': round(sum(temperatures) / len(temperatures), 1),
                'median': round(sorted(temperatures)[len(temperatures) // 2], 1),
                'percentile_25': round(sorted(temperatures)[len(temperatures) // 4], 1),
                'percentile_75': round(
                    sorted(temperatures)[3 * len(temperatures) // 4], 1
                ),
                'std_dev': round(self._calculate_standard_deviation(temperatures), 1),
                'range': max(temperatures) - min(temperatures),
            },
            'apparent_temperature': {
                'min': min(apparent_temps),
                'max': max(apparent_temps),
                'mean': round(sum(apparent_temps) / len(apparent_temps), 1),
                'range': max(apparent_temps) - min(apparent_temps),
            },
        }

    def _calculate_standard_deviation(self, values: list[float]) -> float:
        """Calculate standard deviation of a list of values"""
        if len(values) < self.MIN_DATA_POINTS_FOR_STATS:
            return 0.0

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
        return math.sqrt(variance)

    def _analyze_temperature_trends(self, hourly_data: list[dict]) -> dict:
        """Analyze temperature trends and patterns"""
        if len(hourly_data) < self.MIN_DATA_POINTS_FOR_TREND:
            return {}

        temperatures = [hour['temperature'] for hour in hourly_data]

        # Calculate trend slope using simple linear regression
        n = len(temperatures)
        x_values = list(range(n))

        # Calculate slope (degrees per hour)
        sum_x = sum(x_values)
        sum_y = sum(temperatures)
        sum_xy = sum(x * y for x, y in zip(x_values, temperatures, strict=False))
        sum_x2 = sum(x * x for x in x_values)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)

        # Determine trend direction
        if slope > self.WARMING_SLOPE_THRESHOLD:
            trend_direction = 'warming'
        elif slope < self.COOLING_SLOPE_THRESHOLD:
            trend_direction = 'cooling'
        else:
            trend_direction = 'stable'

        # Find temperature peaks and valleys in next 24 hours
        next_24h = (
            temperatures[: self.HOURS_IN_24H]
            if len(temperatures) >= self.HOURS_IN_24H
            else temperatures
        )
        peaks = []
        valleys = []

        for i in range(1, len(next_24h) - 1):
            if next_24h[i] > next_24h[i - 1] and next_24h[i] > next_24h[i + 1]:
                peaks.append({'hour': i, 'temperature': next_24h[i]})
            elif next_24h[i] < next_24h[i - 1] and next_24h[i] < next_24h[i + 1]:
                valleys.append({'hour': i, 'temperature': next_24h[i]})

        return {
            'overall_slope_per_hour': round(slope, 3),
            'trend_direction': trend_direction,
            'temperature_change_24h': (
                round(temperatures[self.LAST_HOUR_INDEX] - temperatures[0], 1)
                if len(temperatures) > self.LAST_HOUR_INDEX
                else 0
            ),
            'peaks': peaks,
            'valleys': valleys,
            'volatility': round(self._calculate_standard_deviation(temperatures), 1),
        }

    def _generate_percentile_bands(
        self,
        current_temp: float,
        daily_data: list[dict],  # noqa: ARG002
    ) -> dict:
        """Generate historical percentile bands (simplified estimation)"""
        # In a full implementation, this would use historical weather data
        # For now, we'll generate reasonable estimates based on seasonal patterns

        # Estimate seasonal variation (simplified)
        seasonal_variation = 15  # ±15°F seasonal variation
        daily_variation = 10  # ±10°F daily variation

        return {
            '10th_percentile': current_temp - seasonal_variation,
            '25th_percentile': current_temp - daily_variation,
            '50th_percentile': current_temp,  # Median (current as baseline)
            '75th_percentile': current_temp + daily_variation,
            '90th_percentile': current_temp + seasonal_variation,
            'note': 'Percentile bands are estimated based on typical seasonal patterns',
            'data_source': 'estimated',  # In full implementation: 'historical'
        }


class FreeRadarProvider(WeatherProvider):
    """Free radar provider using RainViewer API for precipitation visualization"""

    def __init__(self, timeout: int = 10) -> None:
        super().__init__('FreeRadarProvider')
        self.timeout = timeout

    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """Fetch radar tile URLs and timestamps using free RainViewer API"""
        try:
            # RainViewer provides free radar data globally
            timestamps_url = 'https://api.rainviewer.com/public/weather-maps.json'

            response = requests.get(timestamps_url, timeout=self.timeout)

            if response.status_code != 200:  # noqa: PLR2004
                print(f'❌ RainViewer API returned {response.status_code}')
                return None

            data = response.json()

            # Extract radar timestamps (last 2 hours)
            radar_frames = data.get('radar', {}).get('past', [])
            if not radar_frames:
                print('❌ No radar data available from RainViewer')
                return None

            # Get timestamps and tile URLs (last 12 frames = ~2 hours)
            timestamps = []
            tile_urls = []

            for frame in radar_frames[-12:]:
                timestamp = frame.get('time')
                tile_path = frame.get('path')
                if timestamp and tile_path:
                    timestamps.append(timestamp)
                    # RainViewer tile URL template
                    tile_url = f'https://tilecache.rainviewer.com{tile_path}/256/{{z}}/{{x}}/{{y}}/2/1_1.png'
                    tile_urls.append(tile_url)

            if not timestamps:
                print('❌ No valid radar timestamps found')
                return None

            print(f'✅ RainViewer: Found {len(timestamps)} radar frames')
            return {
                'timestamps': timestamps,
                'tile_urls': tile_urls,
                'current_time': timestamps[-1] if timestamps else int(time.time()),
                'tile_size': 256,
                'zoom_level': 6,
                'attribution': 'Radar data © RainViewer.com',
            }

        except requests.RequestException as e:
            print(f'❌ Failed to fetch radar data from RainViewer: {e}')
            return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Process radar data into a format suitable for the frontend"""
        if not raw_data:
            return {
                'provider': self.name,
                'location_name': location_name or 'Unknown',
                'radar': {
                    'available': False,
                    'frames': [],
                    'animation_metadata': {
                        'total_frames': 0,
                        'historical_frames': 0,
                        'current_frame': 0,
                        'forecast_frames': 0,
                    },
                },
                'error': 'No radar data available',
            }

        timestamps = raw_data.get('timestamps', [])
        tile_urls = raw_data.get('tile_urls', [])

        frames = []
        for i, (timestamp, tile_url) in enumerate(
            zip(timestamps, tile_urls, strict=False)
        ):
            frames.append(
                {
                    'timestamp': timestamp,
                    'tile_url': tile_url,
                    'frame_index': i,
                    'is_current': i == len(timestamps) - 1,
                }
            )

        return {
            'provider': self.name,
            'location_name': location_name or 'Unknown',
            'radar': {
                'available': True,
                'frames': frames,
                'animation_metadata': {
                    'total_frames': len(frames),
                    'historical_frames': len(frames),
                    'current_frame': len(frames) - 1,
                    'forecast_frames': 0,
                },
                'attribution': raw_data.get('attribution', 'RainViewer.com'),
                'tile_size': raw_data.get('tile_size', 256),
            },
        }


class WeatherProviderManager:
    """Manager class to handle multiple weather providers"""

    def __init__(self) -> None:
        self.providers: dict[str, WeatherProvider] = {}
        self.primary_provider: str | None = None
        self.fallback_providers: list[str] = []

    def add_provider(self, provider: WeatherProvider, is_primary: bool = False) -> None:
        """Add a weather provider to the manager"""
        self.providers[provider.name] = provider

        if is_primary:
            self.primary_provider = provider.name
        else:
            self.fallback_providers.append(provider.name)

    def set_primary_provider(self, provider_name: str) -> None:
        """Set the primary weather provider"""
        if provider_name in self.providers:
            # Move current primary to fallbacks if it exists
            if (
                self.primary_provider
                and self.primary_provider != provider_name
                and self.primary_provider not in self.fallback_providers
            ):
                self.fallback_providers.append(self.primary_provider)

            # Set new primary
            self.primary_provider = provider_name

            # Remove from fallbacks if it was there
            if provider_name in self.fallback_providers:
                self.fallback_providers.remove(provider_name)
        else:
            msg = f"Provider '{provider_name}' not found"
            raise ValueError(msg)

    def get_weather(
        self,
        lat: float,
        lon: float,
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict | None:
        """Get weather data using primary provider with fallbacks"""
        # Try primary provider first
        if self.primary_provider and self.primary_provider in self.providers:
            print(f'🎯 Trying primary provider: {self.primary_provider}')
            result = self.providers[self.primary_provider].get_weather(
                lat, lon, location_name, tz_name
            )
            if result:
                return result

        # Try fallback providers
        for provider_name in self.fallback_providers:
            if provider_name in self.providers:
                print(f'🔄 Trying fallback provider: {provider_name}')
                result = self.providers[provider_name].get_weather(
                    lat, lon, location_name, tz_name
                )
                if result:
                    return result

        print('❌ All weather providers failed')
        return None

    def get_provider_info(self) -> dict[str, Any]:
        """Get information about all available providers"""
        return {
            'primary': self.primary_provider,
            'fallbacks': self.fallback_providers,
            'providers': {
                name: provider.get_provider_info()
                for name, provider in self.providers.items()
            },
        }

    def switch_provider(self, provider_name: str) -> bool:
        """Switch to a different primary provider"""
        if provider_name in self.providers:
            # Move current primary to fallbacks
            if self.primary_provider:
                self.fallback_providers.append(self.primary_provider)

            # Set new primary
            self.set_primary_provider(provider_name)
            print(f'🔄 Switched to provider: {provider_name}')
            return True
        print(f"❌ Provider '{provider_name}' not found")
        return False


class LunarDataProvider(WeatherProvider):
    """Lunar data provider for moon phase, illumination, and astronomical data"""

    # Lunar calculation constants
    SYNODIC_MONTH = 29.53058770576  # Average lunar cycle length in days
    NEW_MOON_REFERENCE = 2451549.5  # Julian day of known new moon (Jan 6, 2000)
    LUNAR_MONTH_SECONDS = SYNODIC_MONTH * 24 * 3600  # Synodic month in seconds

    def __init__(self) -> None:
        super().__init__('LunarDataProvider')

    def fetch_weather_data(
        self,
        lat: float,  # noqa: ARG002
        lon: float,  # noqa: ARG002
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """This provider calculates lunar data rather than fetching from APIs"""
        # Lunar calculations are done locally, no external API needed
        return None

    def process_weather_data(
        self,
        raw_data: dict[str, Any],
        location_name: str | None = None,
        tz_name: str | None = None,
    ) -> dict[str, Any] | None:
        """Process lunar data and calculate moon phase information"""
        try:
            # Use current UTC time for calculations
            now_utc = datetime.now(timezone.utc)

            # Calculate lunar data
            lunar_data = self._calculate_lunar_data(now_utc)

            return {
                'provider': self.name,
                'location_name': location_name,
                'timezone': tz_name or 'UTC',
                'lunar_data': lunar_data,
                'calculated_at': now_utc.isoformat(),
            }

        except Exception as e:
            print(f'❌ Error calculating lunar data: {e}')
            return None

    def _calculate_lunar_data(self, now_utc: datetime) -> dict:
        """Calculate comprehensive lunar information"""
        # Convert to Julian Day Number for astronomical calculations
        julian_day = self._to_julian_day(now_utc)

        # Calculate lunar age (days since last new moon)
        lunar_age = self._calculate_lunar_age(julian_day)

        # Calculate illumination percentage
        illumination = self._calculate_illumination(lunar_age)

        # Determine moon phase name
        phase_name = self._get_phase_name(lunar_age, illumination)

        # Calculate next major phases
        next_new_moon = self._calculate_next_new_moon(now_utc)
        next_full_moon = self._calculate_next_full_moon(now_utc)

        # Calculate days until next phases
        days_to_new = (next_new_moon - now_utc).total_seconds() / (24 * 3600)
        days_to_full = (next_full_moon - now_utc).total_seconds() / (24 * 3600)

        return {
            'current_phase': {
                'name': phase_name,
                'illumination_percent': round(illumination * 100, 1),
                'lunar_age_days': round(lunar_age, 1),
                'description': self._get_phase_description(phase_name, illumination),
            },
            'next_phases': {
                'new_moon': {
                    'date': next_new_moon.isoformat(),
                    'days_until': round(days_to_new, 1),
                    'countdown_text': self._format_countdown(days_to_new),
                },
                'full_moon': {
                    'date': next_full_moon.isoformat(),
                    'days_until': round(days_to_full, 1),
                    'countdown_text': self._format_countdown(days_to_full),
                },
            },
            'lunar_cycle': {
                'current_cycle_progress': round(
                    (lunar_age / self.SYNODIC_MONTH) * 100, 1
                ),
                'synodic_month_days': self.SYNODIC_MONTH,
            },
            'astronomical_data': {
                'julian_day': round(julian_day, 4),
                'lunar_distance_varies': True,  # Moon distance varies ~356k-407k km
                'best_viewing': self._get_viewing_recommendations(
                    phase_name, illumination
                ),
            },
        }

    def _to_julian_day(self, dt: datetime) -> float:
        """Convert datetime to Julian Day Number for astronomical calculations"""
        # Convert to Julian Day Number (standard astronomical reference)
        year = dt.year
        month = dt.month
        day = dt.day
        hour = dt.hour
        minute = dt.minute
        second = dt.second + dt.microsecond / 1_000_000

        # Julian Day algorithm
        if month <= 2:
            year -= 1
            month += 12

        julian_century_adjustment = 2 - (year // 100) + ((year // 100) // 4)
        julian_day = (
            int(365.25 * (year + 4716))
            + int(30.6001 * (month + 1))
            + day
            + julian_century_adjustment
            - 1524.5
        )

        # Add fractional day for time
        fractional_day = (hour + minute / 60 + second / 3600) / 24
        return julian_day + fractional_day

    def _calculate_lunar_age(self, julian_day: float) -> float:
        """Calculate lunar age in days since last new moon"""
        # Days since the reference new moon
        days_since_reference = julian_day - self.NEW_MOON_REFERENCE

        # Number of complete lunar cycles
        cycles = days_since_reference / self.SYNODIC_MONTH

        # Fractional part gives us position in current cycle
        fractional_cycle = cycles - int(cycles)

        # Convert to days in current cycle
        lunar_age = fractional_cycle * self.SYNODIC_MONTH

        # Ensure positive value
        if lunar_age < 0:
            lunar_age += self.SYNODIC_MONTH

        return lunar_age

    def _calculate_illumination(self, lunar_age: float) -> float:
        """Calculate moon illumination fraction (0.0 to 1.0)"""
        # Phase angle in radians (0 to 2π)
        # Offset by π so that age 0 = new moon (dark), age 14.76 = full moon (bright)
        phase_angle = (lunar_age / self.SYNODIC_MONTH) * 2 * math.pi

        # Illumination formula: (1 - cos(phase_angle)) / 2
        # This gives 0 at new moon (age 0), 1 at full moon (age 14.76)
        illumination = (1 - math.cos(phase_angle)) / 2

        return max(0.0, min(1.0, illumination))

    def _get_phase_name(self, lunar_age: float, illumination: float) -> str:
        """Determine the name of the current moon phase"""
        # Phase boundaries in days (approximate)
        new_moon_threshold = 1.0
        first_quarter_range = (6.0, 9.0)
        full_moon_range = (13.0, 16.0)
        third_quarter_range = (20.0, 23.0)

        if lunar_age < new_moon_threshold or lunar_age > (
            self.SYNODIC_MONTH - new_moon_threshold
        ):
            return 'New Moon'
        if first_quarter_range[0] <= lunar_age <= first_quarter_range[1]:
            return 'First Quarter'
        if full_moon_range[0] <= lunar_age <= full_moon_range[1]:
            return 'Full Moon'
        if third_quarter_range[0] <= lunar_age <= third_quarter_range[1]:
            return 'Third Quarter'
        if lunar_age < first_quarter_range[0]:
            return 'Waxing Crescent'
        if lunar_age < full_moon_range[0]:
            return 'Waxing Gibbous'
        if lunar_age < third_quarter_range[0]:
            return 'Waning Gibbous'
        return 'Waning Crescent'

    def _calculate_next_new_moon(self, now_utc: datetime) -> datetime:
        """Calculate the date/time of the next new moon"""
        julian_now = self._to_julian_day(now_utc)

        # Find how many synodic months since reference
        months_since_ref = (julian_now - self.NEW_MOON_REFERENCE) / self.SYNODIC_MONTH

        # Next new moon is at the next integer month
        next_month = math.ceil(months_since_ref)
        next_new_moon_julian = self.NEW_MOON_REFERENCE + (
            next_month * self.SYNODIC_MONTH
        )

        return self._from_julian_day(next_new_moon_julian)

    def _calculate_next_full_moon(self, now_utc: datetime) -> datetime:
        """Calculate the date/time of the next full moon"""
        # Full moon occurs ~14.76 days after new moon
        full_moon_offset = self.SYNODIC_MONTH / 2

        julian_now = self._to_julian_day(now_utc)
        months_since_ref = (julian_now - self.NEW_MOON_REFERENCE) / self.SYNODIC_MONTH

        # Find next full moon (halfway between new moons)
        current_month = math.floor(months_since_ref)
        current_full_moon = (
            self.NEW_MOON_REFERENCE
            + (current_month * self.SYNODIC_MONTH)
            + full_moon_offset
        )

        if current_full_moon < julian_now:
            # Current full moon has passed, get next one
            next_full_moon_julian = current_full_moon + self.SYNODIC_MONTH
        else:
            next_full_moon_julian = current_full_moon

        return self._from_julian_day(next_full_moon_julian)

    def _from_julian_day(self, julian_day: float) -> datetime:
        """Convert Julian Day Number back to datetime"""
        # Julian Day to Gregorian calendar conversion
        julian_day_int = int(julian_day + 0.5)
        fractional_day = julian_day + 0.5 - julian_day_int

        if julian_day_int >= 2299161:  # Gregorian calendar
            alpha = int((julian_day_int - 1867216.25) / 36524.25)
            beta = julian_day_int + 1 + alpha - int(alpha / 4)
        else:  # Julian calendar
            beta = julian_day_int

        gamma = beta + 1524
        delta = int((gamma - 122.1) / 365.25)
        epsilon = int(365.25 * delta)
        zeta = int((gamma - epsilon) / 30.6001)

        day = gamma - epsilon - int(30.6001 * zeta)
        month = zeta - 1 if zeta <= 13 else zeta - 13
        year = delta - 4716 if month > 2 else delta - 4715

        # Convert fractional day to time
        total_seconds = fractional_day * 24 * 3600
        hour = int(total_seconds // 3600)
        minute = int((total_seconds % 3600) // 60)
        second = int(total_seconds % 60)
        microsecond = int((total_seconds % 1) * 1_000_000)

        return datetime(
            year, month, day, hour, minute, second, microsecond, timezone.utc
        )

    def _format_countdown(self, days: float) -> str:
        """Format countdown text for next moon phase"""
        if days < 1:
            hours = int(days * 24)
            return f'{hours} hours'
        if days < 2:
            return '1 day'
        return f'{int(days)} days'

    def _get_phase_description(self, phase_name: str, illumination: float) -> str:
        """Get descriptive text for the current moon phase"""
        illumination_percent = int(illumination * 100)

        descriptions = {
            'New Moon': 'The moon is not visible, creating dark skies perfect for stargazing',
            'Waxing Crescent': f'A thin crescent moon is growing brighter ({illumination_percent}% illuminated)',
            'First Quarter': 'Half of the moon is illuminated, rising around noon',
            'Waxing Gibbous': (
                f'More than half illuminated and growing brighter '
                f'({illumination_percent}%)'
            ),
            'Full Moon': 'The moon is fully illuminated, rising at sunset and setting at sunrise',
            'Waning Gibbous': (
                f'More than half illuminated but decreasing '
                f'({illumination_percent}%)'
            ),
            'Third Quarter': 'Half illuminated, rising around midnight',
            'Waning Crescent': (
                f'A thin crescent moon is fading '
                f'({illumination_percent}% illuminated)'
            ),
        }

        return descriptions.get(phase_name, f'Moon phase: {phase_name}')

    def _get_viewing_recommendations(
        self, phase_name: str, _illumination: float
    ) -> dict[str, str]:
        """Get viewing and photography recommendations for current moon phase"""
        recommendations = {
            'New Moon': {
                'visibility': 'Not visible',
                'photography': 'Perfect for deep-sky astrophotography',
                'best_time': 'All night (moon not present)',
                'stargazing': 'Excellent - darkest skies',
            },
            'Waxing Crescent': {
                'visibility': 'Visible in western sky after sunset',
                'photography': 'Great for lunar crescents and earthshine',
                'best_time': 'Evening twilight',
                'stargazing': 'Good - minimal light pollution',
            },
            'First Quarter': {
                'visibility': 'Visible from noon to midnight',
                'photography': 'Excellent detail in lunar craters',
                'best_time': 'Evening hours',
                'stargazing': 'Fair - some light pollution',
            },
            'Waxing Gibbous': {
                'visibility': 'Visible most of the night',
                'photography': 'Good for detailed lunar surface',
                'best_time': 'Evening to late night',
                'stargazing': 'Limited - bright moonlight',
            },
            'Full Moon': {
                'visibility': 'Visible all night',
                'photography': 'Beautiful but challenging due to brightness',
                'best_time': 'All night',
                'stargazing': 'Poor - very bright',
            },
            'Waning Gibbous': {
                'visibility': 'Rises after sunset, visible until morning',
                'photography': 'Good morning photography opportunities',
                'best_time': 'Late night to dawn',
                'stargazing': 'Limited early, better toward dawn',
            },
            'Third Quarter': {
                'visibility': 'Visible from midnight to noon',
                'photography': 'Great early morning shots',
                'best_time': 'Pre-dawn hours',
                'stargazing': 'Good in early evening',
            },
            'Waning Crescent': {
                'visibility': 'Visible in eastern sky before sunrise',
                'photography': 'Beautiful crescent photography',
                'best_time': 'Pre-dawn twilight',
                'stargazing': 'Excellent in evening',
            },
        }

        return recommendations.get(
            phase_name,
            {
                'visibility': 'Check astronomical references',
                'photography': 'Varies by phase',
                'best_time': 'Depends on moon position',
                'stargazing': 'Varies with illumination',
            },
        )
