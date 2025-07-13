use askama::Template;

#[derive(Template)]
#[template(path = "weather.html")]
pub struct WeatherTemplate {
    pub location: Option<String>,
    pub backend_type: String,
}

impl WeatherTemplate {
    pub fn render(location: Option<String>) -> String {
        let template = WeatherTemplate {
            location,
            backend_type: "Rust".to_string(),
        };
        
        template.render().unwrap_or_else(|e| {
            eprintln!("Template rendering error: {}", e);
            format!("Template error: {}", e)
        })
    }
}