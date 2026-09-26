using System;
using System.Collections.ObjectModel;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Devices;
using Microsoft.Maui.Graphics;
using Microsoft.Maui.Storage;
using PantryWizard.Models;

namespace PantryWizard
{
    public partial class PantryPage : ContentPage
    {
        public ObservableCollection<PantryItem> PantryItems { get; set; } = new();

        public PantryPage()
        {
            InitializeComponent();
            BindingContext = this;
            ApplyTheme();
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();
            ApplyTheme();

            PantryItems.Clear();
            var items = await App.Database.GetItemsAsync();
            foreach (var item in items)
            {
                PantryItems.Add(item);
            }
        }

        private void ApplyTheme()
        {
            bool isDarkMode = Preferences.Get("DarkModeEnabled", false);

            this.BackgroundColor = isDarkMode ? Color.FromArgb("#1B1530") : Colors.White;
            HeaderLabel.TextColor = isDarkMode ? Color.FromArgb("#D5AFFF") : Color.FromArgb("#8F66B3");
            AddButton.BackgroundColor = isDarkMode ? Color.FromArgb("#6E4BA9") : Color.FromArgb("#EAD7FF");
            AddButton.TextColor = Colors.White;

            PantryListView.ItemTemplate = GetPantryItemTemplate(isDarkMode);
        }

        private DataTemplate GetPantryItemTemplate(bool isDarkMode)
        {
            return new DataTemplate(() =>
            {
                var frame = new Frame
                {
                    Margin = new Thickness(0, 10),
                    Padding = 10,
                    CornerRadius = 10,
                    HasShadow = false,
                    BorderColor = Colors.Transparent,
                    BackgroundColor = isDarkMode ? Color.FromArgb("#301B4D") : Color.FromArgb("#E9DEFF")
                };

                var grid = new Grid
                {
                    ColumnDefinitions =
                    {
                        new ColumnDefinition { Width = GridLength.Auto },
                        new ColumnDefinition { Width = GridLength.Star },
                        new ColumnDefinition { Width = GridLength.Auto }
                    },
                    RowDefinitions =
                    {
                        new RowDefinition { Height = GridLength.Auto },
                        new RowDefinition { Height = GridLength.Auto },
                        new RowDefinition { Height = GridLength.Auto }
                    }
                };

                var image = new Image { WidthRequest = 50, HeightRequest = 50, Margin = new Thickness(0, 0, 10, 0) };
                image.SetBinding(Image.SourceProperty, "Image");
                Grid.SetRowSpan(image, 3);

                var nameLabel = new Label
                {
                    FontSize = 22,
                    FontFamily = "QuicksandBold",
                    TextColor = isDarkMode ? Color.FromArgb("#D5AFFF") : Color.FromArgb("#986FC9")
                };
                nameLabel.SetBinding(Label.TextProperty, "Name");
                Grid.SetColumn(nameLabel, 1);

                var quantityLabel = new Label
                {
                    FontSize = 16,
                    TextColor = isDarkMode ? Color.FromArgb("#B37EFF") : Color.FromArgb("#B27CFF")
                };
                quantityLabel.SetBinding(Label.TextProperty, "DisplayQuantity");
                Grid.SetColumn(quantityLabel, 1);
                Grid.SetRow(quantityLabel, 1);

                var dateLabel = new Label
                {
                    FontSize = 14,
                    TextColor = isDarkMode ? Color.FromArgb("#AD82FF") : Color.FromArgb("#9F6EFF"),
                    HorizontalTextAlignment = TextAlignment.End
                };
                dateLabel.SetBinding(Label.TextProperty, new Binding("DateAdded", stringFormat: "{0:MMM d, yyyy}"));
                Grid.SetColumn(dateLabel, 2);

                var locationLabel = new Label
                {
                    FontSize = 14,
                    TextColor = isDarkMode ? Color.FromArgb("#BD9DFF") : Color.FromArgb("#A46BFF"),
                    HorizontalTextAlignment = TextAlignment.End
                };
                locationLabel.SetBinding(Label.TextProperty, "LocationInfo");
                Grid.SetColumn(locationLabel, 2);
                Grid.SetRow(locationLabel, 1);

                var expLabel = new Label
                {
                    FontSize = 12,
                    TextColor = isDarkMode ? Color.FromArgb("#C5A4FF") : Color.FromArgb("#B793FF"),
                    HorizontalTextAlignment = TextAlignment.End
                };
                expLabel.SetBinding(Label.TextProperty, "ExpirationInfo");
                Grid.SetColumn(expLabel, 2);
                Grid.SetRow(expLabel, 2);

                grid.Children.Add(image);
                grid.Children.Add(nameLabel);
                grid.Children.Add(quantityLabel);
                grid.Children.Add(dateLabel);
                grid.Children.Add(locationLabel);
                grid.Children.Add(expLabel);

                frame.Content = grid;

                var tapGesture = new TapGestureRecognizer();
                tapGesture.Tapped += OnItemTapped;
                frame.GestureRecognizers.Add(tapGesture);

                return frame;
            });
        }

        private async void OnAddItemClicked(object sender, EventArgs e)
        {
            TriggerVibration(50);

            if (Preferences.Get("TextToSpeechEnabled", false))
            {
                await Services.TextToSpeechService.SpeakAsync("Add item");
            }

            await Navigation.PushAsync(new AddItemPage());
        }

        private async void OnItemTapped(object sender, EventArgs e)
        {
            TriggerVibration(50);

            if (sender is Frame frame && frame.BindingContext is PantryItem tappedItem)
            {
                string spokenExpiry = tappedItem.ExpirationInfo.Replace("Exp:", "Expiry:");

                await Services.TextToSpeechService.SpeakAsync(
                    $"{tappedItem.Name}, {tappedItem.DisplayQuantity}, {spokenExpiry}"
                );

                await Navigation.PushAsync(new EditItemPage(tappedItem));
            }
        }

        private void TriggerVibration(int durationMs)
        {
            try
            {
                Vibration.Default.Vibrate(TimeSpan.FromMilliseconds(durationMs));
                System.Diagnostics.Debug.WriteLine($"[VIBRATION] Triggered for {durationMs}ms");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[VIBRATION] Failed: {ex.Message}");
            }
        }
    }
}





