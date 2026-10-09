import { useState, type FormEvent } from "react";

function Settings() {
  const [businessName, setBusinessName] = useState("Smart Inventory Store");
  const [phone, setPhone] = useState("0300-1234567");
  const [address, setAddress] = useState("Hyderabad, Sindh");
  const [currency, setCurrency] = useState("PKR");
  const [lowStock, setLowStock] = useState("10");
  const [notifications, setNotifications] = useState(true);

  const saveSettings = (e: FormEvent) => {
    e.preventDefault();

    alert("Settings saved successfully!");
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>Manage your business and system preferences</p>
        </div>
      </div>

      <form onSubmit={saveSettings}>
        {/* Business Information */}

        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Business Information</h2>
              <p>Update your business details</p>
            </div>
          </div>

          <div className="settings-grid">
            <div className="settings-group">
              <label>Business Name</label>

              <input
                type="text"
                value={businessName}
                onChange={(e) =>
                  setBusinessName(e.target.value)
                }
                placeholder="Enter business name"
              />
            </div>

            <div className="settings-group">
              <label>Phone Number</label>

              <input
                type="text"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
                placeholder="Enter phone number"
              />
            </div>

            <div className="settings-group full-width">
              <label>Business Address</label>

              <textarea
                value={address}
                onChange={(e) =>
                  setAddress(e.target.value)
                }
                placeholder="Enter business address"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Inventory Settings */}

        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Inventory Settings</h2>
              <p>Configure inventory management preferences</p>
            </div>
          </div>

          <div className="settings-grid">
            <div className="settings-group">
              <label>Default Currency</label>

              <select
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value)
                }
              >
                <option value="PKR">
                  PKR - Pakistani Rupee
                </option>

                <option value="USD">
                  USD - US Dollar
                </option>

                <option value="AED">
                  AED - UAE Dirham
                </option>
              </select>
            </div>

            <div className="settings-group">
              <label>Low Stock Threshold</label>

              <input
                type="number"
                min="1"
                value={lowStock}
                onChange={(e) =>
                  setLowStock(e.target.value)
                }
              />

              <small>
                Products below this quantity will be
                marked as low stock.
              </small>
            </div>
          </div>
        </div>

        {/* System Settings */}

        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>System Settings</h2>
              <p>Manage system preferences</p>
            </div>
          </div>

          <div className="notification-setting">
            <div>
              <strong>Low Stock Notifications</strong>

              <p>
                Show notifications when products reach
                the low stock threshold.
              </p>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) =>
                  setNotifications(e.target.checked)
                }
              />

              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Save */}

        <div className="settings-actions">
          <button
            type="submit"
            className="save-settings-btn"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;