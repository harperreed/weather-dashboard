# ABOUTME: Weather provider classes for OpenMeteo weather API
# ABOUTME: Abstraction layer for weather data access with OpenMeteo provider

from abc import ABC, abstractmethod
from datetime import datetime, timezone
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
                    'cloud_cover,wind_speed_10m,wind_direction_10m,uv_index,'
                    'pressure_msl,surface_pressure,dew_point_2m'
                ),
                'minutely_15': (
                    'temperature_2m,precipitation,rain,snowfall,weather_code'
                ),
                'hourly': (
                    'temperature_2m,precipitation_probability,precipitation,'
                    'rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m'
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
                for i in range(start_index, min(start_index + 24, len(hourly['time']))):
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

            return {
                'current': current_weather,
                'hourly': hourly_forecast,
                'daily': daily_forecast,
                'minutely': minutely_data,
                'sun': sun_data,
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
        """Determine if it's day based on icon (PirateWeather includes day/night in icons)"""
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

        print(
            f'🔍 Data sources available: PirateWeather={has_pirate}, OpenMeteo={has_openmeteo}'
        )

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
            print(
                f'🔀 Blended current conditions: PirateWeather + OpenMeteo (data age: {blended_current.get("data_age", 0)}min)'
            )

        # Keep OpenMeteo's forecasts (they're excellent)
        # Keep OpenMeteo's minutely data (15-min precipitation)

        # Add provider info
        blended['provider'] = 'Hybrid (PirateWeather + OpenMeteo)'
        blended['location'] = location_name or 'Unknown Location'

        return blended


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
