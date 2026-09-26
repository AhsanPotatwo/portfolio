using Microsoft.Maui.Controls;
using Microsoft.Maui.Storage;
using System;
using System.Threading.Tasks;
using Microsoft.Maui.Devices;
using System.Diagnostics;

namespace PantryWizard
{
    public partial class MainPage : ContentPage
    {
        public MainPage()
        {
            InitializeComponent();
            ApplyTheme(); // Still needed for the first load
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            ApplyTheme(); // Re-applies the theme every time the page is shown
        }

        private void ApplyTheme()
        {
            bool isDarkMode = Preferences.Get("DarkModeEnabled", false);

            if (isDarkMode)
            {
                this.Background = new LinearGradientBrush
                {
                    StartPoint = new Point(0, 0),
                    EndPoint = new Point(1, 1),
                    GradientStops = new GradientStopCollection
                    {
                        new GradientStop { Color = Color.FromArgb("#1D0631"), Offset = 0.0f },
                        new GradientStop { Color = Color.FromArgb("#2C1050"), Offset = 0.5f },
                        new GradientStop { Color = Color.FromArgb("#22275D"), Offset = 1.0f }
                    }
                };

                WelcomeLabel.TextColor = Color.FromArgb("#D5AFFF");
                TitleLabel.TextColor = Color.FromArgb("#D5AFFF");
                SubtitleLabel.TextColor = Color.FromArgb("#9E7FD9");
                EnterButton.BackgroundColor = Color.FromArgb("#6E4BA9");
            }
            else
            {
                this.Background = new LinearGradientBrush
                {
                    StartPoint = new Point(0, 0),
                    EndPoint = new Point(1, 1),
                    GradientStops = new GradientStopCollection
                    {
                        new GradientStop { Color = Color.FromArgb("#5E7FFF"), Offset = 0.0f },
                        new GradientStop { Color = Color.FromArgb("#AF53FF"), Offset = 1.0f }
                    }
                };

                WelcomeLabel.TextColor = Colors.White;
                TitleLabel.TextColor = Colors.White;
                SubtitleLabel.TextColor = Colors.White;
                EnterButton.BackgroundColor = Color.FromArgb("#B184FF");
            }
        }

        private void OnSettingsClicked(object sender, EventArgs e)
        {
            Navigation.PushAsync(new SettingsPage());
        }

        private async void OnEnterClicked(object sender, EventArgs e)
        {
            try
            {
                Vibration.Vibrate(TimeSpan.FromMilliseconds(100));
                System.Diagnostics.Debug.WriteLine("Vibration triggered.");
            }
            catch (FeatureNotSupportedException)
            {
                System.Diagnostics.Debug.WriteLine("Vibration not supported on this device.");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Vibration failed: {ex.Message}");
            }

            // Speak if enabled
            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync("Enter pantry page");
            }

            await Navigation.PushAsync(new PantryPage());
        }
    }
}

