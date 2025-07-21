# ABOUTME: Weather provider classes for OpenMeteo and National Weather Service APIs
# ABOUTME: Abstraction layer for weather data access with multiple providers

import time
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
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'exclude': 'minutely,daily,alerts',
                'units': 'imperial',
            }

            # First get basic weather data to ensure API key works
            response = requests.get(timestamps_url, params=params, timeout=self.timeout)

            if response.status_code == 401:
                print('❌ OpenWeatherMap API key invalid for radar')
                return None
            if response.status_code != 200:
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
                f'🌧️  Radar: Generated {len(timestamps)} frames for {len(zoom_levels)} zoom levels'
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
                f'🌦️  Processed radar: {total_frames} frames, {historical_frames}h history + {forecast_frames/6:.1f}h forecast'
            )

            return processed_data

        except Exception as e:
            print(f'❌ Radar data processing error: {str(e)}')
            return None


class ClothingRecommendationProvider(WeatherProvider):
    """Smart clothing recommendations based on weather conditions and forecasts"""
    
    def __init__(self) -> None:
        super().__init__('ClothingRecommendationProvider')
        
    def fetch_weather_data(
        self,
        lat: float,
        lon: float,
        tz_name: str | None = None,  # noqa: ARG002
    ) -> dict | None:
        """This provider processes existing weather data rather than fetching new data"""
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
                next_12h_precip=next_12h_precip
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
                            'uv_index': uv_index
                        }
                    }
                }
            }
            
        except Exception as e:
            print(f'❌ Clothing recommendation error: {str(e)}')
            return None
    
    def _generate_clothing_recommendations(
        self,
        current_temp: float,
        feels_like: float,
        temp_high: float,
        temp_low: float,
        humidity: float,
        wind_speed: float,
        precipitation_prob: float,
        uv_index: float,
        next_12h_temps: list[float],
        next_12h_precip: list[float],
    ) -> dict:
        """Generate specific clothing recommendations based on weather analysis"""
        
        recommendations = {
            'primary_suggestion': '',
            'items': [],
            'warnings': [],
            'comfort_tips': [],
            'activity_specific': {}
        }
        
        # Temperature-based base layer recommendations
        if feels_like >= 85:
            base_layer = 'Light, breathable fabrics'
            recommendations['items'].extend(['shorts', 't-shirt', 'sandals'])
        elif feels_like >= 75:
            base_layer = 'Lightweight clothing'
            recommendations['items'].extend(['light pants', 'short sleeves', 'comfortable shoes'])
        elif feels_like >= 65:
            base_layer = 'Comfortable casual wear'
            recommendations['items'].extend(['pants', 'long sleeves', 'closed shoes'])
        elif feels_like >= 50:
            base_layer = 'Layers recommended'
            recommendations['items'].extend(['pants', 'light sweater', 'jacket'])
        elif feels_like >= 35:
            base_layer = 'Warm clothing needed'
            recommendations['items'].extend(['warm pants', 'sweater', 'coat', 'warm shoes'])
        else:
            base_layer = 'Heavy winter clothing'
            recommendations['items'].extend(['insulated pants', 'heavy coat', 'warm layers', 'winter boots'])
            
        # Wind adjustments
        if wind_speed > 15:
            recommendations['items'].append('wind-resistant outer layer')
            recommendations['warnings'].append(f'Strong winds ({wind_speed} mph) - wind-resistant clothing recommended')
        
        # Precipitation adjustments  
        if precipitation_prob > 60 or any(p > 0.1 for p in next_12h_precip):
            recommendations['items'].extend(['waterproof jacket', 'umbrella'])
            recommendations['warnings'].append(f'Rain likely ({precipitation_prob}%) - bring rain protection')
        elif precipitation_prob > 30:
            recommendations['comfort_tips'].append('Consider bringing an umbrella just in case')
            
        # UV protection
        if uv_index >= 8:
            recommendations['items'].extend(['sunscreen', 'hat', 'sunglasses'])
            recommendations['warnings'].append(f'High UV index ({uv_index}) - sun protection essential')
        elif uv_index >= 6:
            recommendations['items'].extend(['sunscreen', 'hat'])
            recommendations['comfort_tips'].append('Moderate UV - sun protection recommended')
        elif uv_index >= 3:
            recommendations['comfort_tips'].append('Some sun protection advised during peak hours')
            
        # Temperature swing analysis
        temp_swing = temp_high - temp_low
        if temp_swing > 20:
            recommendations['warnings'].append(f'Large temperature swing ({temp_swing:.0f}°) - dress in layers')
            recommendations['items'].append('layering pieces')
        elif temp_swing > 15:
            recommendations['comfort_tips'].append('Temperature will change - consider layering')
            
        # Humidity comfort
        if humidity > 80 and current_temp > 70:
            recommendations['comfort_tips'].append('High humidity - choose breathable fabrics')
        elif humidity < 30:
            recommendations['comfort_tips'].append('Low humidity - consider moisturizer')
            
        # Generate primary suggestion
        if feels_like >= 80:
            recommendations['primary_suggestion'] = f'{base_layer} - stay cool and hydrated'
        elif feels_like <= 32:
            recommendations['primary_suggestion'] = f'{base_layer} - bundle up and stay warm' 
        elif temp_swing > 15:
            recommendations['primary_suggestion'] = f'{base_layer} - dress in removable layers'
        elif precipitation_prob > 50:
            recommendations['primary_suggestion'] = f'{base_layer} with rain protection'
        else:
            recommendations['primary_suggestion'] = base_layer
            
        # Activity-specific recommendations
        recommendations['activity_specific'] = {
            'commuting': self._get_commute_recommendations(feels_like, wind_speed, precipitation_prob),
            'exercise': self._get_exercise_recommendations(feels_like, humidity, uv_index),
            'outdoor_work': self._get_outdoor_work_recommendations(feels_like, wind_speed, uv_index, precipitation_prob)
        }
        
        return recommendations
    
    def _get_commute_recommendations(self, feels_like: float, wind_speed: float, precipitation_prob: float) -> str:
        """Generate commute-specific recommendations"""
        suggestions = []
        
        if feels_like < 40:
            suggestions.append('warm coat and gloves')
        elif feels_like > 80:
            suggestions.append('light layers you can remove indoors')
            
        if wind_speed > 20:
            suggestions.append('secure any loose items')
            
        if precipitation_prob > 40:
            suggestions.append('waterproof shoes and jacket')
            
        if not suggestions:
            suggestions.append('standard work attire should be comfortable')
            
        return ', '.join(suggestions)
    
    def _get_exercise_recommendations(self, feels_like: float, humidity: float, uv_index: float) -> str:
        """Generate exercise-specific recommendations"""
        suggestions = []
        
        if feels_like > 75:
            suggestions.append('moisture-wicking fabrics')
        if humidity > 70:
            suggestions.append('extra hydration')
        if uv_index >= 6:
            suggestions.append('sun protection and early/late timing')
        if feels_like < 45:
            suggestions.append('warm-up layers you can remove')
            
        if not suggestions:
            suggestions.append('standard workout gear should work well')
            
        return ', '.join(suggestions)
    
    def _get_outdoor_work_recommendations(self, feels_like: float, wind_speed: float, uv_index: float, precipitation_prob: float) -> str:
        """Generate outdoor work recommendations"""  
        suggestions = []
        
        if feels_like > 85:
            suggestions.append('frequent shade breaks and cooling gear')
        elif feels_like < 32:
            suggestions.append('insulated work gear and hand warmers')
            
        if wind_speed > 25:
            suggestions.append('secure all equipment and materials')
            
        if uv_index >= 7:
            suggestions.append('long sleeves, hat, and frequent sunscreen')
        
        if precipitation_prob > 30:
            suggestions.append('waterproof work gear')
            
        if not suggestions:
            suggestions.append('standard work clothing appropriate')
            
        return ', '.join(suggestions)


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

            if points_response.status_code != 200:
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
            alerts_params = {
                'point': f'{lat:.4f},{lon:.4f}',
                'status': 'actual',
                'limit': 20,
            }

            alerts_response = requests.get(
                alerts_url, params=alerts_params, headers=headers, timeout=self.timeout
            )

            alerts_data = None
            if alerts_response.status_code == 200:
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
            if forecast_response.status_code == 200:
                forecast_data = forecast_response.json()
            else:
                print(f'⚠️  NWS forecast API returned {forecast_response.status_code}')

            print(f'🏛️  NWS API: Grid {grid_office}/{grid_x},{grid_y}')

            return {
                'points': points_data,
                'alerts': alerts_data,
                'forecast': forecast_data,
                'grid_info': {'office': grid_office, 'x': grid_x, 'y': grid_y},
            }

        except Exception as e:
            print(f'❌ NWS API error: {str(e)}')
            return None

    def process_weather_data(
        self,
        raw_data: dict,
        location_name: str | None = None,
        tz_name: str | None = None,
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
            forecast_periods = []
            if forecast:
                periods = forecast.get('properties', {}).get('periods', [])
                for period in periods[:7]:  # Next 7 periods
                    forecast_periods.append(
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

            return processed_data

        except Exception as e:
            print(f'❌ NWS data processing error: {str(e)}')
            return None


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
