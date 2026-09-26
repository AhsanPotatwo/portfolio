using System.Threading.Tasks;
using Microsoft.Maui.Media;
using Microsoft.Maui.Storage;

namespace PantryWizard.Services
{
    public static class TextToSpeechService
    {
        public static async Task SpeakAsync(string text)
        {
            bool isTtsEnabled = Preferences.Get("TextToSpeechEnabled", false);

            if (isTtsEnabled && !string.IsNullOrWhiteSpace(text))
            {
                await TextToSpeech.SpeakAsync(text);
            }
        }
    }
}
