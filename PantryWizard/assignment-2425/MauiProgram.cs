using Microsoft.Extensions.Logging;
using Microsoft.Maui.Controls.Hosting;
using Microsoft.Maui.Hosting;
using System.Net.Http;

namespace PantryWizard
{
    public static class MauiProgram
    {
        public static MauiApp CreateMauiApp()
        {
            var builder = MauiApp.CreateBuilder();

            builder
                .UseMauiApp<App>()
                .ConfigureFonts(fonts =>
                {
                    fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                    fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
                    fonts.AddFont("Quicksand-Bold.ttf", "QuicksandBold");
                    fonts.AddFont("Quicksand-SemiBold.ttf", "QuicksandSemiBold");
                    fonts.AddFont("Quicksand-Light.ttf", "QuicksandLight");
                    fonts.AddFont("Quicksand-Medium.ttf", "QuicksandMedium");
                    fonts.AddFont("Quicksand-Regular.ttf", "Quicksand");
                });

            builder.Services.AddSingleton<HttpClient>();

#if DEBUG
            builder.Logging.AddDebug();
#endif

            return builder.Build();
        }
    }
}


