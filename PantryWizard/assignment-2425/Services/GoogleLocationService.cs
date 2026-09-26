using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace PantryWizard.Services
{
    public static class GoogleLocationService
    {
        // Put your own Google Maps Geocoding API key here to get city names.
        // Don't commit a real key. Without one, the lookup is skipped and
        // items are stamped with their coordinates instead.
        private const string KeyPlaceholder = "YOUR_GOOGLE_MAPS_API_KEY";
        private static readonly string ApiKey = KeyPlaceholder;

        // Returns the city name, or null if it couldn't be found
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
                                if (type.GetString() == "locality") // This means city
                                {
                                    return component.GetProperty("long_name").GetString();
                                }
                            }
                        }
                    }
                }

                // no city in the results (or the request was refused, e.g. a bad key)
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
