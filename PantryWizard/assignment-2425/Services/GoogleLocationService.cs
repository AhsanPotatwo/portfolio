using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace PantryWizard.Services
{
    public static class GoogleLocationService
    {
        private const string ApiKey = "AIzaSyBzfrAzabvT5EQTmYeS0n1jp14nhPfQ1hU";

        public static async Task<string> GetCityFromCoordinatesAsync(double latitude, double longitude)
        {
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

                return "Unknown city";
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Google location error: {ex.Message}");
                return "Error getting city";
            }
        }
    }
}
