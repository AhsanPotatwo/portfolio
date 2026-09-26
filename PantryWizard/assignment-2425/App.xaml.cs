using Microsoft.Maui.Controls;
using System;
using System.IO;
using PantryWizard.Services;
using Microsoft.Maui;

namespace PantryWizard
{

    public partial class App : Application
    {
        public static PantryDatabase Database { get; private set; }


        public App()
        {
            InitializeComponent();

            MainPage = new NavigationPage(new MainPage());

            string dbPath = Path.Combine(FileSystem.AppDataDirectory, "Pantry.db3");
            Database = new PantryDatabase(dbPath);
        }


    }


}
