using Microsoft.Maui.Controls;
using Microsoft.Maui.Graphics;
using Microsoft.Maui.Storage;
using PantryWizard.Models;
using System;
using Microsoft.Maui.Devices;

namespace PantryWizard
{
    public partial class EditItemPage : ContentPage
    {
        private PantryItem _item;

        public EditItemPage(PantryItem item)
        {
            InitializeComponent();
            _item = item;

            ApplyTheme();

            NameEntry.TextChanged += (s, e) => NameFrame.BackgroundColor = GetEntryBackground();
            QuantityEntry.TextChanged += (s, e) => QuantityFrame.BackgroundColor = GetEntryBackground();
            QuantityTypePicker.SelectedIndexChanged += (s, e) => QuantityTypeFrame.BackgroundColor = GetEntryBackground();

            NameEntry.Text = item.Name;
            QuantityEntry.Text = item.Quantity;
            QuantityTypePicker.SelectedItem = item.QuantityType;
            ExpirationDatePicker.Date = DateTime.TryParse(item.ExpirationInfo?.Replace("Exp: ", ""), out var date) ? date : DateTime.Now;
            ItemImage.Source = item.Image;

            // Accessibility + Vibration
            NameEntry.Focused += async (s, e) =>
            {
                TriggerVibration("Name field focused");
                if (Preferences.Get("TextToSpeechEnabled", false))
                    await Services.TextToSpeechService.SpeakAsync("Item name");
            };

            QuantityEntry.Focused += async (s, e) =>
            {
                TriggerVibration("Quantity field focused");
                if (Preferences.Get("TextToSpeechEnabled", false))
                    await Services.TextToSpeechService.SpeakAsync("Item quantity");
            };

            QuantityTypePicker.Focused += async (s, e) =>
            {
                TriggerVibration("Quantity type picker focused");
                if (Preferences.Get("TextToSpeechEnabled", false))
                    await Services.TextToSpeechService.SpeakAsync("Select quantity type");
            };

            ExpirationDatePicker.Focused += async (s, e) =>
            {
                TriggerVibration("Date picker focused");
                if (Preferences.Get("TextToSpeechEnabled", false))
                    await Services.TextToSpeechService.SpeakAsync("Select expiration date");
            };
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            ApplyTheme();
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

        private async void OnSaveClicked(object sender, EventArgs e)
        {
            TriggerVibration("Save button pressed");

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
                await DisplayAlert("Incomplete Form", "Please fill in all required fields before saving.", "OK");
                return;
            }

            _item.Name = NameEntry.Text;
            _item.Quantity = QuantityEntry.Text;
            _item.QuantityType = QuantityTypePicker.SelectedItem.ToString();
            _item.ExpirationInfo = $"Exp: {ExpirationDatePicker.Date.ToShortDateString()}";

            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                string spokenExpiry = _item.ExpirationInfo.Replace("Exp:", "Expiry:");
                await Services.TextToSpeechService.SpeakAsync($"Saved {_item.Name}, {_item.Quantity} {_item.QuantityType}, {spokenExpiry}");
            }

            await App.Database.SaveItemAsync(_item);
            await Navigation.PopAsync();
        }

        private async void OnCancelClicked(object sender, EventArgs e)
        {
            TriggerVibration("Cancel button pressed");

            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync("Cancelled.");
            }

            await Navigation.PopAsync();
        }

        private async void OnDeleteClicked(object sender, EventArgs e)
        {
            TriggerVibration("Delete button pressed");

            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync($"Are you sure you want to delete {_item.Name}?");
            }

            bool confirm = await DisplayAlert("Delete Item", "Are you sure you want to delete this item?", "Delete", "Cancel");

            if (confirm)
            {
                await App.Database.DeleteItemAsync(_item);

                if (Preferences.Get("TextToSpeechEnabled", false))
                {
                    await Services.TextToSpeechService.SpeakAsync($"{_item.Name} deleted.");
                }

                await Navigation.PopAsync();
            }
            else
            {
                if (Preferences.Get("TextToSpeechEnabled", false))
                {
                    await Services.TextToSpeechService.SpeakAsync("Deletion cancelled.");
                }
            }
        }

        private async void OnPickImageClicked(object sender, EventArgs e)
        {
            TriggerVibration("Edit image button pressed");

            var option = await DisplayActionSheet("Select Image Source", "Cancel", null, "Take Photo", "Choose from Gallery");

            if (option == "Take Photo")
            {
                try
                {
                    var photo = await MediaPicker.CapturePhotoAsync();
                    if (photo != null)
                    {
                        var stream = await photo.OpenReadAsync();
                        _item.Image = photo.FullPath;
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
                var result = await FilePicker.PickAsync();
                if (result != null)
                {
                    _item.Image = result.FullPath;
                    ItemImage.Source = ImageSource.FromFile(_item.Image);
                }
            }
        }

        private void TriggerVibration(string debugMessage)
        {
            try
            {
                Vibration.Default.Vibrate(TimeSpan.FromMilliseconds(100));
                System.Diagnostics.Debug.WriteLine($"Vibration triggered: {debugMessage}");
            }
            catch (FeatureNotSupportedException)
            {
                System.Diagnostics.Debug.WriteLine("Vibration not supported on this device.");
            }
        }
    }
}


