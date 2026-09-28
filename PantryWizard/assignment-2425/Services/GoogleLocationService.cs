using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace PantryWizard.Services
{
    public static class GoogleLocationService
    {
        // add a google maps api key here for city names, otherwise it just uses coordinates
        private const string KeyPlaceholder = "YOUR_GOOGLE_MAPS_API_KEY";
        private static readonly string ApiKey = KeyPlaceholder;

        // null if no city found
        public static async Task<string?> GetCityFromCoordinatesAsync(double latitude, double longitude)
        {
            if (ApiKey == KeyPlaceholder)
                return null;

            try
            {
                var url = $"https://maps.googleapis.com/maps/api/geocode/json?latlng={latitude},{longitude}&key={ApiKey}";
                var client = new HttpClient();
                var response = await client.GetStringAsync(url);

                var json = System.Text.Json.JsonDocument.Parse(response);

                foreach (var result in json.RootElement.GetProperty("results").EnumerateArray())
                {
                    if (result.TryGetProperty("address_components", out var components))
                    {
                        foreach (var component in components.EnumerateArray())
                        {
                            foreach (var type in component.GetProperty("types").EnumerateArray())
                            {
                                if (type.GetString() == "locality") // city
                                {
                                    return component.GetProperty("long_name").GetString();
                                }
                            }
                        }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Google location error: {ex.Message}");
                return null;
            }
        }
    }
}
