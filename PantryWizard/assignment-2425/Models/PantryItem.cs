using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using SQLite;

namespace PantryWizard.Models
{
    public class PantryItem
    {
        [PrimaryKey, AutoIncrement]
        public int Id { get; set; }

        public string Name { get; set; }
        public string Quantity { get; set; }
        public string Image { get; set; }
        public DateTime DateAdded { get; set; }
        public string ExpirationInfo { get; set; }
        public string QuantityType { get; set; }

        public string LocationInfo { get; set; }

        public string DisplayQuantity => $"{Quantity} {QuantityType}";
    }
}
