"""ABOUTME: Test WebSocket functionality for weather dashboard
ABOUTME: Tests WebSocket event handlers and real-time weather updates"""

from unittest.mock import MagicMock, patch

from flask_socketio import SocketIOTestClient

from main import CHICAGO_LAT, CHICAGO_LON, app, socketio


# Test constants
EXPECTED_MESSAGE_COUNT = 2


class TestWebSocketHandlers:
    """Test WebSocket event handlers"""

    def test_handle_connect(self) -> None:
        """Test client connection handler"""
        client = SocketIOTestClient(app, socketio)
        received = client.get_received()

        # Should receive provider_info on connect
        assert len(received) == 1
        assert received[0]["name"] == "provider_info"
        assert "args" in received[0]

    def test_handle_disconnect(self) -> None:
        """Test client disconnection handler"""
        client = SocketIOTestClient(app, socketio)
        client.disconnect()
        # Disconnect should complete without errors
        assert True

    @patch("main.weather_manager.get_weather")
    def test_handle_weather_update_request(self, mock_get_weather: MagicMock) -> None:
        """Test weather update request handler"""
        # Mock weather data response
        mock_weather_data = {
            "temperature": 72,
            "condition": "sunny",
            "location": "Chicago"
        }
        mock_get_weather.return_value = mock_weather_data

        client = SocketIOTestClient(app, socketio)

        # Send weather update request
        client.emit("request_weather_update", {
            "lat": 41.8781,
            "lon": -87.6298,
            "location": "Chicago"
        })

        received = client.get_received()

        # Should receive provider_info on connect plus weather_update
        assert len(received) >= EXPECTED_MESSAGE_COUNT
        weather_update = next(
            (r for r in received if r["name"] == "weather_update"), None
        )
        assert weather_update is not None
        assert weather_update["args"][0] == mock_weather_data

    @patch("main.weather_manager.get_weather")
    def test_handle_weather_update_request_with_defaults(
        self, mock_get_weather: MagicMock
    ) -> None:
        """Test weather update request with default values"""
        mock_weather_data = {
            "temperature": 72,
            "condition": "sunny",
            "location": "Chicago"
        }
        mock_get_weather.return_value = mock_weather_data

        client = SocketIOTestClient(app, socketio)

        # Send empty request to test defaults
        client.emit("request_weather_update", {})

        # Verify get_weather was called with default Chicago coordinates
        mock_get_weather.assert_called_once()
        args = mock_get_weather.call_args[0]
        # Chicago lat
        assert args[0] == CHICAGO_LAT
        # Chicago lon
        assert args[1] == CHICAGO_LON
        assert args[2] == "Chicago"  # Default location

    @patch("main.weather_manager.get_weather")
    def test_handle_weather_update_request_failure(
        self, mock_get_weather: MagicMock
    ) -> None:
        """Test weather update request when weather fetch fails"""
        # Mock weather service failure
        mock_get_weather.return_value = None

        client = SocketIOTestClient(app, socketio)

        # Send weather update request
        client.emit("request_weather_update", {
            "lat": 41.8781,
            "lon": -87.6298,
            "location": "Chicago"
        })

        received = client.get_received()

        # Should only receive provider_info on connect, no weather_update
        weather_updates = [r for r in received if r["name"] == "weather_update"]
        assert len(weather_updates) == 0
