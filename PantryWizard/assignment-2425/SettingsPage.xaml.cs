using Microsoft.Maui.Controls;
using Microsoft.Maui.Storage;
using Microsoft.Maui.Graphics;

namespace PantryWizard
{
    public partial class SettingsPage : ContentPage
    {
        public SettingsPage()
        {
            InitializeComponent();
            ApplyTheme();

            // Load saved toggle states
            DarkModeSwitch.IsToggled = Preferences.Get("DarkModeEnabled", false);
            TtsSwitch.IsToggled = Preferences.Get("TextToSpeechEnabled", false);
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            ApplyTheme(); // Re-apply theme in case it changed
        }

        private void ApplyTheme()
        {
            bool isDark = Preferences.Get("DarkModeEnabled", false);

            if (isDark)
            {
                this.BackgroundColor = Color.FromArgb("#1B1530");
                TitleLabel.TextColor = Color.FromArgb("#D5AFFF");

                AccessibilityHeader.TextColor = Color.FromArgb("#9E7FD9");
                DarkModeTitle.TextColor = Color.FromArgb("#D5AFFF");
                DarkModeDesc.TextColor = Color.FromArgb("#9E7FD9");

                TtsTitle.TextColor = Color.FromArgb("#D5AFFF");
                TtsDesc.TextColor = Color.FromArgb("#9E7FD9");

                AccessibilityFrame.BackgroundColor = Color.FromArgb("#2E1F46");
                OtherFrame.BackgroundColor = Color.FromArgb("#2E1F46");
                OtherHeader.TextColor = Color.FromArgb("#9E7FD9");
            }
            else
            {
                this.BackgroundColor = Colors.White;
                TitleLabel.TextColor = Color.FromArgb("#8F66B3");

                AccessibilityHeader.TextColor = Color.FromArgb("#B89AE0");
                DarkModeTitle.TextColor = Color.FromArgb("#6A4B8D");
                DarkModeDesc.TextColor = Color.FromArgb("#9B77C6");

                TtsTitle.TextColor = Color.FromArgb("#6A4B8D");
                TtsDesc.TextColor = Color.FromArgb("#9B77C6");

                AccessibilityFrame.BackgroundColor = Color.FromArgb("#DCC5FF");
                OtherFrame.BackgroundColor = Color.FromArgb("#DCC5FF");
                OtherHeader.TextColor = Color.FromArgb("#B89AE0");
            }
        }

        private async void OnDarkModeToggled(object sender, ToggledEventArgs e)
        {
            Preferences.Set("DarkModeEnabled", e.Value);

            // Speak toggle status
            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                string status = e.Value ? "on" : "off";
                await Services.TextToSpeechService.SpeakAsync($"Dark mode turned {status}");
            }

            // Fade out
            await this.FadeTo(0, 200);

            // Apply new theme
            ApplyTheme();

            // Fade in
            await this.FadeTo(1, 200);
        }

        private async void OnTextToSpeechToggled(object sender, ToggledEventArgs e)
        {
            // Speak first, before disabling TTS
            if (e.Value == false && Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync("Text to speech turned off");
            }
            else if (e.Value == true)
            {
                await Services.TextToSpeechService.SpeakAsync("Text to speech turned on");
            }

            Preferences.Set("TextToSpeechEnabled", e.Value);
        }

    }
}

