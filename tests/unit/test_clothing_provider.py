import time
from typing import Any
from unittest.mock import patch

import pytest

from weather_providers import ClothingRecommendationProvider


# Test constants
CHICAGO_LAT = 41.8781
CHICAGO_LON = -87.6298
PROVIDER_TIMEOUT = 10


class TestClothingRecommendationProvider:
    """Test the clothing recommendations provider for smart clothing suggestions"""

    @pytest.fixture
    def clothing_provider(self) -> ClothingRecommendationProvider:
        """Create a clothing recommendation provider instance for testing"""
        return ClothingRecommendationProvider()

    @pytest.fixture
    def mock_weather_data_summer(self) -> dict[str, Any]:
        """Mock summer weather data for testing"""
        return {
            'current': {
                'temperature': 82,
                'feels_like': 88,
                'humidity': 65,
                'wind_speed': 12,
                'precipitation_prob': 15,
                'uv_index': 8,
            },
            'hourly': [
                {'temp': 82, 'rain': 0},
                {'temp': 85, 'rain': 0},
                {'temp': 88, 'rain': 0.02},
                {'temp': 86, 'rain': 0},
                {'temp': 84, 'rain': 0},
                {'temp': 81, 'rain': 0},
            ],
            'daily': [{'h': 90, 'l': 72}]
        }

    @pytest.fixture 
    def mock_weather_data_winter(self) -> dict[str, Any]:
        """Mock winter weather data for testing"""
        return {
            'current': {
                'temperature': 25,
                'feels_like': 18,
                'humidity': 75,
                'wind_speed': 22,
                'precipitation_prob': 80,
                'uv_index': 2,
            },
            'hourly': [
                {'temp': 25, 'rain': 0.15},
                {'temp': 23, 'rain': 0.25},
                {'temp': 20, 'rain': 0.30},
                {'temp': 18, 'rain': 0.20},
            ],
            'daily': [{'h': 28, 'l': 15}]
        }

    def test_clothing_provider_initialization(self, clothing_provider: ClothingRecommendationProvider) -> None:
        """Test clothing recommendation provider initialization"""
        assert clothing_provider.name == 'ClothingRecommendationProvider'
        assert clothing_provider.timeout == 10

    def test_fetch_weather_data_returns_none(self, clothing_provider: ClothingRecommendationProvider) -> None:
        """Test that fetch_weather_data returns None as this provider processes existing data"""
        result = clothing_provider.fetch_weather_data(CHICAGO_LAT, CHICAGO_LON)
        assert result is None

    def test_process_weather_data_summer_conditions(
        self,
        clothing_provider: ClothingRecommendationProvider,
        mock_weather_data_summer: dict[str, Any],
    ) -> None:
        """Test clothing recommendations for hot summer conditions"""
        
        result = clothing_provider.process_weather_data(mock_weather_data_summer, 'Chicago')
        
        assert result is not None
        assert result['provider'] == 'ClothingRecommendationProvider'
        assert result['location_name'] == 'Chicago'
        assert 'timestamp' in result
        
        # Check clothing structure
        clothing = result['clothing']
        assert 'recommendations' in clothing
        assert 'weather_context' in clothing
        
        recommendations = clothing['recommendations']
        
        # Should recommend light summer clothing
        assert 'Light, breathable fabrics' in recommendations['primary_suggestion']
        assert 'shorts' in recommendations['items']
        assert 't-shirt' in recommendations['items']
        
        # Should include UV warnings for high UV index
        assert any('UV index' in warning for warning in recommendations['warnings'])
        assert 'sunscreen' in recommendations['items']
        assert 'hat' in recommendations['items']
        assert 'sunglasses' in recommendations['items']
        
        # Should have activity-specific recommendations
        assert 'commuting' in recommendations['activity_specific']
        assert 'exercise' in recommendations['activity_specific']
        assert 'outdoor_work' in recommendations['activity_specific']

    def test_process_weather_data_winter_conditions(
        self,
        clothing_provider: ClothingRecommendationProvider,
        mock_weather_data_winter: dict[str, Any],
    ) -> None:
        """Test clothing recommendations for cold winter conditions"""
        
        result = clothing_provider.process_weather_data(mock_weather_data_winter, 'Chicago')
        
        assert result is not None
        recommendations = result['clothing']['recommendations']
        
        # Should recommend warm winter clothing
        assert 'Heavy winter clothing' in recommendations['primary_suggestion']
        assert 'insulated pants' in recommendations['items']
        assert 'heavy coat' in recommendations['items']
        assert 'winter boots' in recommendations['items']
        
        # Should include wind warnings
        assert any('Strong winds' in warning for warning in recommendations['warnings'])
        assert 'wind-resistant outer layer' in recommendations['items']
        
        # Should include rain protection
        assert any('Rain likely' in warning for warning in recommendations['warnings'])
        assert 'waterproof jacket' in recommendations['items']
        assert 'umbrella' in recommendations['items']

    def test_process_weather_data_temperature_swing(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test recommendations for large temperature swings"""
        
        weather_data = {
            'current': {
                'temperature': 55,
                'feels_like': 52,
                'humidity': 60,
                'wind_speed': 8,
                'precipitation_prob': 25,
                'uv_index': 4,
            },
            'hourly': [{'temp': 55, 'rain': 0}],
            'daily': [{'h': 78, 'l': 45}]  # 33-degree swing
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        assert result is not None
        recommendations = result['clothing']['recommendations']
        
        # Should warn about temperature swing and recommend layers
        assert any('temperature swing' in warning.lower() for warning in recommendations['warnings'])
        assert 'layering pieces' in recommendations['items']
        assert 'layers' in recommendations['primary_suggestion']

    def test_process_weather_data_high_humidity(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test recommendations for high humidity conditions"""
        
        weather_data = {
            'current': {
                'temperature': 78,
                'feels_like': 85,
                'humidity': 90,  # Very high humidity
                'wind_speed': 5,
                'precipitation_prob': 10,
                'uv_index': 6,
            },
            'hourly': [{'temp': 78, 'rain': 0}],
            'daily': [{'h': 82, 'l': 74}]
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        assert result is not None
        recommendations = result['clothing']['recommendations']
        
        # Should recommend breathable fabrics for high humidity
        assert any('breathable fabrics' in tip for tip in recommendations['comfort_tips'])

    def test_process_weather_data_empty_data(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test processing empty weather data"""
        
        result = clothing_provider.process_weather_data({}, 'Chicago')
        
        # Should return None for empty data
        assert result is None

    def test_process_weather_data_none_input(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test processing None input"""
        
        result = clothing_provider.process_weather_data(None, 'Chicago')  # type: ignore[arg-type]
        
        assert result is None

    def test_activity_recommendations_commuting(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test commuting-specific recommendations"""
        
        # Test cold commuting weather
        weather_data = {
            'current': {
                'temperature': 35,
                'feels_like': 30,
                'humidity': 60,
                'wind_speed': 15,
                'precipitation_prob': 50,
                'uv_index': 2,
            },
            'hourly': [{'temp': 35, 'rain': 0.1}],
            'daily': [{'h': 40, 'l': 28}]
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        assert result is not None
        commuting_advice = result['clothing']['recommendations']['activity_specific']['commuting']
        
        assert 'warm coat and gloves' in commuting_advice
        assert 'waterproof shoes and jacket' in commuting_advice

    def test_activity_recommendations_exercise(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test exercise-specific recommendations"""
        
        # Test hot, humid exercise weather
        weather_data = {
            'current': {
                'temperature': 80,
                'feels_like': 88,
                'humidity': 85,
                'wind_speed': 5,
                'precipitation_prob': 10,
                'uv_index': 9,
            },
            'hourly': [{'temp': 80, 'rain': 0}],
            'daily': [{'h': 85, 'l': 75}]
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        assert result is not None
        exercise_advice = result['clothing']['recommendations']['activity_specific']['exercise']
        
        assert 'moisture-wicking fabrics' in exercise_advice
        assert 'extra hydration' in exercise_advice
        assert 'sun protection' in exercise_advice

    def test_activity_recommendations_outdoor_work(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test outdoor work specific recommendations"""
        
        # Test extreme heat for outdoor work
        weather_data = {
            'current': {
                'temperature': 95,
                'feels_like': 102,
                'humidity': 60,
                'wind_speed': 30,
                'precipitation_prob': 40,
                'uv_index': 10,
            },
            'hourly': [{'temp': 95, 'rain': 0.05}],
            'daily': [{'h': 98, 'l': 88}]
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        assert result is not None
        outdoor_work_advice = result['clothing']['recommendations']['activity_specific']['outdoor_work']
        
        assert 'cooling gear' in outdoor_work_advice
        assert 'secure all equipment' in outdoor_work_advice
        assert 'long sleeves, hat' in outdoor_work_advice
        assert 'waterproof work gear' in outdoor_work_advice

    def test_weather_context_extraction(
        self,
        clothing_provider: ClothingRecommendationProvider,
        mock_weather_data_summer: dict[str, Any],
    ) -> None:
        """Test that weather context is properly extracted and included"""
        
        result = clothing_provider.process_weather_data(mock_weather_data_summer, 'Chicago')
        
        assert result is not None
        weather_context = result['clothing']['weather_context']
        
        assert weather_context['current_temp'] == 82
        assert weather_context['feels_like'] == 88
        assert weather_context['temp_range']['high'] == 90
        assert weather_context['temp_range']['low'] == 72
        
        conditions = weather_context['conditions']
        assert conditions['humidity'] == 65
        assert conditions['wind_speed'] == 12
        assert conditions['precipitation_prob'] == 15
        assert conditions['uv_index'] == 8

    def test_get_weather_integration(
        self,
        clothing_provider: ClothingRecommendationProvider,
        mock_weather_data_summer: dict[str, Any],
    ) -> None:
        """Test complete get_weather flow"""
        
        # Since this provider doesn't fetch data, get_weather should return None
        result = clothing_provider.get_weather(CHICAGO_LAT, CHICAGO_LON, 'Chicago')
        
        assert result is None

    def test_provider_info(self, clothing_provider: ClothingRecommendationProvider) -> None:
        """Test provider info method"""
        
        info = clothing_provider.get_provider_info()
        
        assert info['name'] == 'ClothingRecommendationProvider'
        assert info['timeout'] == 10
        assert 'clothing recommendations' in info['description'].lower()

    def test_edge_case_missing_current_data(
        self,
        clothing_provider: ClothingRecommendationProvider,
    ) -> None:
        """Test handling of missing current weather data"""
        
        weather_data = {
            'hourly': [{'temp': 70, 'rain': 0}],
            'daily': [{'h': 75, 'l': 65}]
        }
        
        result = clothing_provider.process_weather_data(weather_data, 'Chicago')
        
        # Should still work with default values
        assert result is not None
        assert result['provider'] == 'ClothingRecommendationProvider'
        
        # Should use default temperature (70°F)
        weather_context = result['clothing']['weather_context']
        assert weather_context['current_temp'] == 70

    def test_recommendation_structure_completeness(
        self,
        clothing_provider: ClothingRecommendationProvider,
        mock_weather_data_summer: dict[str, Any],
    ) -> None:
        """Test that all expected recommendation fields are present"""
        
        result = clothing_provider.process_weather_data(mock_weather_data_summer, 'Chicago')
        
        assert result is not None
        recommendations = result['clothing']['recommendations']
        
        # Check all expected fields are present
        expected_fields = ['primary_suggestion', 'items', 'warnings', 'comfort_tips', 'activity_specific']
        for field in expected_fields:
            assert field in recommendations
            
        # Check activity specific fields
        activity_fields = ['commuting', 'exercise', 'outdoor_work']
        for activity in activity_fields:
            assert activity in recommendations['activity_specific']
            assert isinstance(recommendations['activity_specific'][activity], str)