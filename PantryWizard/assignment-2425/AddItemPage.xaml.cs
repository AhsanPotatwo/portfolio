using System;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Storage;
using Microsoft.Maui.Graphics;
using Microsoft.Maui.Devices;
using PantryWizard.Models;
using Microsoft.Maui.ApplicationModel;

namespace PantryWizard
{
    public partial class AddItemPage : ContentPage
    {
        private string selectedImagePath = "placeholder.png";
        private string detectedLocation = "Unknown location";

        public AddItemPage()
        {
            InitializeComponent();
            ApplyTheme();

            NameEntry.TextChanged += (s, e) => NameFrame.BackgroundColor = GetEntryBackground();
            QuantityEntry.TextChanged += (s, e) => QuantityFrame.BackgroundColor = GetEntryBackground();
            QuantityTypePicker.SelectedIndexChanged += (s, e) => QuantityTypeFrame.BackgroundColor = GetEntryBackground();

            NameEntry.Focused += OnNameEntryFocused;
            QuantityEntry.Focused += OnQuantityEntryFocused;
            QuantityTypePicker.Focused += OnQuantityTypePickerFocused;
            ExpirationDatePicker.Focused += OnExpirationDatePickerFocused;
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();
            ApplyTheme();
            await DetectLocationAsync();
        }

        private void ApplyTheme()
        {
            bool isDark = Preferences.Get("DarkModeEnabled", false);

            this.BackgroundColor = isDark ? Color.FromArgb("#1B1530") : Colors.White;
            BottomGrid.BackgroundColor = isDark ? Color.FromArgb("#4B2D6A") : Color.FromArgb("#B784FF");

            TitleLabel.TextColor = isDark ? Color.FromArgb("#D5AFFF") : Color.FromArgb("#8F66B3");
            EditImageButton.BackgroundColor = isDark ? Color.FromArgb("#6E4BA9") : Color.FromArgb("#D2A8FF");

            NameFrame.BackgroundColor = QuantityFrame.BackgroundColor = QuantityTypeFrame.BackgroundColor = DateFrame.BackgroundColor = GetEntryBackground();

            NameEntry.TextColor = QuantityEntry.TextColor = QuantityTypePicker.TextColor =
                ExpirationDatePicker.TextColor = isDark ? Colors.White : Colors.Black;

            NameEntry.PlaceholderColor = QuantityEntry.PlaceholderColor = QuantityTypePicker.TitleColor =
                ExpirationDatePicker.TextColor = isDark ? Color.FromArgb("#D5AFFF") : Color.FromArgb("#67489D");
        }

        private Color GetEntryBackground()
        {
            bool isDark = Preferences.Get("DarkModeEnabled", false);
            return isDark ? Color.FromArgb("#301B4D") : Color.FromArgb("#DEC7FF");
        }

        private async void OnPickImageClicked(object sender, EventArgs e)
        {
            Vibrate("Edit image clicked");

            var option = await DisplayActionSheet("Select Image Source", "Cancel", null, "Take Photo", "Choose from Gallery");

            if (option == "Take Photo")
            {
                try
                {
                    var photo = await MediaPicker.CapturePhotoAsync();
                    if (photo != null)
                    {
                        var stream = await photo.OpenReadAsync();
                        selectedImagePath = photo.FullPath;
                        ItemImage.Source = ImageSource.FromStream(() => stream);
                    }
                }
                catch
                {
                    await DisplayAlert("Camera Error", "Camera not available or access denied.", "OK");
                }
            }
            else if (option == "Choose from Gallery")
            {
                var result = await FilePicker.PickAsync(new PickOptions { PickerTitle = "Pick an image" });

                if (result != null)
                {
                    selectedImagePath = result.FullPath;
                    ItemImage.Source = ImageSource.FromFile(selectedImagePath);
                }
            }
        }

        private async void OnSubmitClicked(object sender, EventArgs e)
        {
            Vibrate("Submit clicked");

            bool isValid = true;

            if (string.IsNullOrWhiteSpace(NameEntry.Text))
            {
                NameFrame.BackgroundColor = Color.FromArgb("#FFCCCC");
                isValid = false;
            }

            if (string.IsNullOrWhiteSpace(QuantityEntry.Text))
            {
                QuantityFrame.BackgroundColor = Color.FromArgb("#FFCCCC");
                isValid = false;
            }

            if (QuantityTypePicker.SelectedItem == null)
            {
                QuantityTypeFrame.BackgroundColor = Color.FromArgb("#FFCCCC");
                isValid = false;
            }

            if (!isValid)
            {
                await DisplayAlert("Error", "Please fill all required fields.", "OK");
                return;
            }

            var newItem = new PantryItem
            {
                Name = NameEntry.Text,
                Quantity = QuantityEntry.Text,
                QuantityType = QuantityTypePicker.SelectedItem.ToString(),
                DateAdded = DateTime.Now,
                ExpirationInfo = $"Exp: {ExpirationDatePicker.Date.ToShortDateString()}",
                Image = selectedImagePath,
                LocationInfo = detectedLocation
            };

            string expirySpoken = newItem.ExpirationInfo.Replace("Exp:", "Expiry:");
            await Services.TextToSpeechService.SpeakAsync(
                $"Added {newItem.Name}, {newItem.Quantity} {newItem.QuantityType}, {expirySpoken}"
            );

            await App.Database.SaveItemAsync(newItem);
            await Navigation.PopAsync();
        }

        private async void OnCancelClicked(object sender, EventArgs e)
        {
            Vibrate("Cancel clicked");

            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync("Cancelled.");
            }

            await Navigation.PopAsync();
        }

        private async void OnNameEntryFocused(object sender, FocusEventArgs e)
        {
            Vibrate("NameEntry focused");
            if (Preferences.Get("TextToSpeechEnabled", false))
                await Services.TextToSpeechService.SpeakAsync("Item name");
        }

        private async void OnQuantityEntryFocused(object sender, FocusEventArgs e)
        {
            Vibrate("QuantityEntry focused");
            if (Preferences.Get("TextToSpeechEnabled", false))
                await Services.TextToSpeechService.SpeakAsync("Item quantity");
        }

        private async void OnQuantityTypePickerFocused(object sender, FocusEventArgs e)
        {
            Vibrate("QuantityTypePicker focused");
            if (Preferences.Get("TextToSpeechEnabled", false))
                await Services.TextToSpeechService.SpeakAsync("Select quantity type");
        }

        private async void OnExpirationDatePickerFocused(object sender, FocusEventArgs e)
        {
            Vibrate("ExpirationDatePicker focused");
            if (Preferences.Get("TextToSpeechEnabled", false))
                await Services.TextToSpeechService.SpeakAsync("Select expiration date");
        }

        private void Vibrate(string actionDescription)
        {
            try
            {
                Vibration.Default.Vibrate(TimeSpan.FromMilliseconds(50));
                System.Diagnostics.Debug.WriteLine($"Vibrate: {actionDescription}");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Vibration failed: {ex.Message}");
            }
        }

        private async Task DetectLocationAsync()
        {
            try
            {
                var status = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();
                if (status != PermissionStatus.Granted)
                {
                    System.Diagnostics.Debug.WriteLine("Location permission denied");
                    return;
                }

                var request = new GeolocationRequest(GeolocationAccuracy.High, TimeSpan.FromSeconds(10));
                var location = await Geolocation.GetLocationAsync(request);

                if (location != null)
                {
                    System.Diagnostics.Debug.WriteLine($"Coordinates: {location.Latitude}, {location.Longitude}");

                    // Check for mock provider
                    if (location.IsFromMockProvider)
                        System.Diagnostics.Debug.WriteLine("⚠️ Location is from mock provider.");

                    // Attempt city lookup using Google Maps API
                    string city = await Services.GoogleLocationService.GetCityFromCoordinatesAsync(location.Latitude, location.Longitude);

                    // If lookup fails, fallback to coordinates
                    if (!string.IsNullOrWhiteSpace(city) && !city.Contains("Error"))
                    {
                        detectedLocation = $"📍 {city}";
                    }
                    else
                    {
                        detectedLocation = $"📍 {location.Latitude:0.000000}, {location.Longitude:0.000000}";
                    }

                    System.Diagnostics.Debug.WriteLine($"Detected Location: {detectedLocation}");
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine("Could not get location.");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Location error: {ex.Message}");
            }
        }

    }
}



