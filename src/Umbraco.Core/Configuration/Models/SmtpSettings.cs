﻿using System;
using System.ComponentModel.DataAnnotations;
using System.Net.Mail;
using Umbraco.Core.Configuration.Models.Validation;

namespace Umbraco.Core.Configuration.Models
{
    public class SmtpSettings : ValidatableEntryBase
    {
        [Required]
        [EmailAddress]
        public string From { get; set; }

        public string Host { get; set; }

        public int Port { get; set; }

        public string PickupDirectoryLocation { get; set; }

        // See notes on ContentSettings.MacroErrors
        internal string DeliveryMethod { get; set; } = SmtpDeliveryMethod.Network.ToString();

        public SmtpDeliveryMethod DeliveryMethodValue
        {
            get
            {
                return Enum.TryParse<SmtpDeliveryMethod>(DeliveryMethod, true, out var value)
                    ? value
                    : SmtpDeliveryMethod.Network;
            }
        }

        public string Username { get; set; }

        public string Password { get; set; }
    }
}
