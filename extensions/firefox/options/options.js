/*
Copyright 2015 Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

"use strict";
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

var storageAreaName = browserAPI.storage.sync ? "sync" : "local";
var storageArea = browserAPI.storage[storageAreaName];

initializeApiKeyHandlers();

Promise.all([
  new Promise(function getManagedPrefs(resolve) {
    if (!browserAPI.storage.managed) {
      resolve({});
      return;
    }
    // Get preferences as set by the system administrator.
    browserAPI.storage.managed.get(null, function (prefs) {
      // Managed storage may be disabled, e.g. in Opera.
      resolve(prefs || {});
    });
  }),
  new Promise(function getUserPrefs(resolve) {
    storageArea.get(null, function (prefs) {
      resolve(prefs || {});
    });
  }),
  new Promise(function getStorageSchema(resolve) {
    // Get the storage schema - a dictionary of preferences.
    var x = new XMLHttpRequest();
    var schema_location = browserAPI.runtime.getManifest().storage.managed_schema;
    x.open("get", browserAPI.runtime.getURL(schema_location));
    x.onload = function () {
      resolve(x.response.properties);
    };
    x.responseType = "json";
    x.send();
  }),
])
  .then(function (values) {
    var managedPrefs = values[0];
    var userPrefs = values[1];
    var schema = values[2];
    function getPrefValue(prefName) {
      if (prefName in userPrefs) {
        return userPrefs[prefName];
      } else if (prefName in managedPrefs) {
        return managedPrefs[prefName];
      }
      return schema[prefName].default;
    }
    var prefNames = Object.keys(schema);
    var renderPreferenceFunctions = {};
    // Render options
    prefNames.forEach(function (prefName) {
      var prefSchema = schema[prefName];
      if (!prefSchema.title) {
        // Don't show preferences if the title is missing.
        return;
      }

      // A DOM element with a method renderPreference.
      var renderPreference;
      if (prefSchema.type === "boolean") {
        // Most prefs are booleans, render them in a generic way.
        renderPreference = renderBooleanPref(
          prefSchema.title,
          prefSchema.description,
          prefName
        );
      } else if (prefSchema.type === "integer" && prefSchema.enum) {
        // Most other prefs are integer-valued enumerations, render them in a
        // generic way too.
        // Unlike the renderBooleanPref branch, each preference handled by this
        // branch still needs its own template in options.html with
        // id="$prefName-template".
        renderPreference = renderEnumPref(prefSchema.title, prefName);
      } else if (prefName === "defaultZoomValue") {
        renderPreference = renderDefaultZoomValue(prefSchema.title);
      } else {
        // Should NEVER be reached. Only happens if a new type of preference is
        // added to the storage manifest.
        console.error("Don't know how to handle " + prefName + "!");
        return;
      }

      renderPreference(getPrefValue(prefName));
      renderPreferenceFunctions[prefName] = renderPreference;
    });

    // Names of preferences that are displayed in the UI.
    var renderedPrefNames = Object.keys(renderPreferenceFunctions);

    // Reset button to restore default settings.
    document.getElementById("reset-button").onclick = function () {
      userPrefs = {};
      storageArea.remove(prefNames, function () {
        renderedPrefNames.forEach(function (prefName) {
          renderPreferenceFunctions[prefName](getPrefValue(prefName));
        });
      });
    };

    // Automatically update the UI when the preferences were changed elsewhere.
    browserAPI.storage.onChanged.addListener(function (changes, areaName) {
      var prefs = null;
      if (areaName === storageAreaName) {
        prefs = userPrefs;
      } else if (areaName === "managed") {
        prefs = managedPrefs;
      }
      if (prefs) {
        renderedPrefNames.forEach(function (prefName) {
          var prefChanges = changes[prefName];
          if (prefChanges) {
            if ("newValue" in prefChanges) {
              userPrefs[prefName] = prefChanges.newValue;
            } else {
              // Otherwise the pref was deleted
              delete userPrefs[prefName];
            }
            renderPreferenceFunctions[prefName](getPrefValue(prefName));
          }
        });
      }
    });
  })
  .then(null, console.error.bind(console));

function importTemplate(id) {
  return document.importNode(document.getElementById(id).content, true);
}

// Helpers to create UI elements that display the preference, and return a
// function which updates the UI with the preference.

function renderBooleanPref(shortDescription, description, prefName) {
  var wrapper = importTemplate("checkbox-template");
  wrapper.title = description;

  var checkbox = wrapper.querySelector('input[type="checkbox"]');
  checkbox.onchange = function () {
    var pref = {};
    pref[prefName] = this.checked;
    storageArea.set(pref);
  };
  wrapper.querySelector("span").textContent = shortDescription;
  document.getElementById("settings-boxes").append(wrapper);

  function renderPreference(value) {
    checkbox.checked = value;
  }
  return renderPreference;
}

function renderEnumPref(shortDescription, prefName) {
  var wrapper = importTemplate(prefName + "-template");
  var select = wrapper.querySelector("select");
  select.onchange = function () {
    var pref = {};
    pref[prefName] = parseInt(this.value);
    storageArea.set(pref);
  };
  wrapper.querySelector("span").textContent = shortDescription;
  document.getElementById("settings-boxes").append(wrapper);

  function renderPreference(value) {
    select.value = value;
  }
  return renderPreference;
}

function renderDefaultZoomValue(shortDescription) {
  var wrapper = importTemplate("defaultZoomValue-template");
  var select = wrapper.querySelector("select");
  select.onchange = function () {
    storageArea.set({
      defaultZoomValue: this.value,
    });
  };
  wrapper.querySelector("span").textContent = shortDescription;
  document.getElementById("settings-boxes").append(wrapper);

  function renderPreference(value) {
    value = value || "auto";
    select.value = value;
    var customOption = select.querySelector("option.custom-zoom");
    if (select.selectedIndex === -1 && value) {
      // Custom zoom percentage, e.g. set via managed preferences.
      // [zoom] or [zoom],[left],[top]
      customOption.text = value.indexOf(",") > 0 ? value : value + "%";
      customOption.value = value;
      customOption.hidden = false;
      customOption.selected = true;
    } else {
      customOption.hidden = true;
    }
  }
  return renderPreference;
}

function initializeApiKeyHandlers() {
  var geminiInput = document.getElementById("gemini-api-key");
  var semanticScholarInput = document.getElementById("semantic-scholar-api-key");
  
  if (!geminiInput || !semanticScholarInput) {
    return;
  }

  browserAPI.storage.local.get(["geminiApiKey", "semanticScholarApiKey"], function(items) {
    if (items.geminiApiKey) {
      geminiInput.value = items.geminiApiKey;
      geminiInput.classList.add("has-key");
      updateKeyStatus("gemini", true);
    }
    if (items.semanticScholarApiKey) {
      semanticScholarInput.value = items.semanticScholarApiKey;
      semanticScholarInput.classList.add("has-key");
      updateKeyStatus("semantic-scholar", true);
    }
  });

  var saveDebounceTimers = {};
  
  function saveApiKey(keyName, value, inputElement) {
    clearTimeout(saveDebounceTimers[keyName]);
    saveDebounceTimers[keyName] = setTimeout(function() {
      var saveObj = {};
      saveObj[keyName] = value.trim();
      browserAPI.storage.local.set(saveObj, function() {
        var hasKey = value.trim().length > 0;
        if (hasKey) {
          inputElement.classList.add("has-key");
        } else {
          inputElement.classList.remove("has-key");
        }
        var statusId = keyName === "geminiApiKey" ? "gemini" : "semantic-scholar";
        updateKeyStatus(statusId, hasKey);
      });
    }, 500);
  }

  geminiInput.addEventListener("input", function() {
    saveApiKey("geminiApiKey", this.value, this);
  });

  semanticScholarInput.addEventListener("input", function() {
    saveApiKey("semanticScholarApiKey", this.value, this);
  });

  document.querySelectorAll(".toggle-visibility").forEach(function(button) {
    button.addEventListener("click", function() {
      var targetId = this.getAttribute("data-target");
      var input = document.getElementById(targetId);
      if (input.type === "password") {
        input.type = "text";
        this.textContent = "Hide";
      } else {
        input.type = "password";
        this.textContent = "Show";
      }
    });
  });
}

function updateKeyStatus(keyType, isConfigured) {
  var statusElement = document.getElementById(keyType + "-key-status");
  if (!statusElement) return;
  
  var dot = statusElement.querySelector(".status-dot");
  var text = statusElement.querySelector("span:last-child");
  
  if (isConfigured) {
    statusElement.className = "api-key-status configured";
    dot.className = "status-dot green";
    text.textContent = "Configured";
  } else {
    statusElement.className = "api-key-status not-configured";
    dot.className = "status-dot gray";
    text.textContent = "Not configured";
  }
}
