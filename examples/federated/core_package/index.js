// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig } from '@jupyterlab/coreutils';

// This must be after the public path is set.
// This cannot be extracted because the public path is dynamic.
require('./imports.css');

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const newScript = document.createElement('script');
    newScript.onerror = reject;
    newScript.onload = resolve;
    newScript.async = true;
    document.head.appendChild(newScript);
    newScript.src = url;
  });
}

async function loadComponent(url, scope, module) {
  await loadScript(url);

  // From MIT-licensed https://github.com/module-federation/module-federation-examples/blob/af043acd6be1718ee195b2511adf6011fba4233c/advanced-api/dynamic-remotes/app1/src/App.js#L6-L12
  await __webpack_init_sharing__('default');
  const container = window._JUPYTERLAB[scope];
  // Initialize the container, it may provide shared modules and may need ours
  await container.init(__webpack_share_scopes__.default);

  const factory = await window._JUPYTERLAB[scope].get(module);
  const Module = factory();
  return Module;
}


/**
 * The main entry point for the application.
 */
async function main() {
  var JupyterLab = require('@jupyterlab/application').JupyterLab;
  var disabled = [];
  var deferred = [];
  var ignorePlugins = [];
  var register = [];

  // This is all the data needed to load and activate plugins. This should be
  // gathered by the server and put onto the initial page template.
  const extension_data = JSON.parse(
    PageConfig.getOption('dynamic_extensions')
  );
  const mime_extension_data = JSON.parse(
    PageConfig.getOption('dynamic_mime_extensions')
  );

  // Get dynamic plugins
  // TODO: deconflict these with builtins?
  const dynamicPromises = extension_data.map(data =>
    loadComponent(
      data.path,
      data.name,
      data.module
    )
  );
  const dynamicPlugins = await Promise.all(dynamicPromises);

  const dynamicMimePromises = mime_extension_data.map(data =>
    loadComponent(
      data.path,
      data.name,
      data.module
    )
  );
  const dynamicMimePlugins = await Promise.all(dynamicMimePromises);

  // Handle the registered mime extensions.
  var mimeExtensions = [];
  var extension;
  var extMod;
  var plugins = [];
  {{#each jupyterlab_mime_extensions}}
  try {
    extMod = require('{{@key}}/{{this}}');
    extension = extMod.default;

    // Handle CommonJS exports.
    if (!extMod.hasOwnProperty('__esModule')) {
      extension = extMod;
    }

    plugins = Array.isArray(extension) ? extension : [extension];
    plugins.forEach(function(plugin) {
      if (PageConfig.Extension.isDeferred(plugin.id)) {
        deferred.push(plugin.id);
        ignorePlugins.push(plugin.id);
      }
      if (PageConfig.Extension.isDisabled(plugin.id)) {
        disabled.push(plugin.id);
        return;
      }
      mimeExtensions.push(plugin);
    });
  } catch (e) {
    console.error(e);
  }
  {{/each}}

  // Add the dyanmic mime extensions.
  dynamicMimePlugins.forEach(plugin => { mimeExtensions.push(plugin); });

  // Handled the registered standard extensions.
  {{#each jupyterlab_extensions}}
  try {
    extMod = require('{{@key}}/{{this}}');
    extension = extMod.default;

    // Handle CommonJS exports.
    if (!extMod.hasOwnProperty('__esModule')) {
      extension = extMod;
    }

    plugins = Array.isArray(extension) ? extension : [extension];
    plugins.forEach(function(plugin) {
      if (PageConfig.Extension.isDeferred(plugin.id)) {
        deferred.push(plugin.id);
        ignorePlugins.push(plugin.id);
      }
      if (PageConfig.Extension.isDisabled(plugin.id)) {
        disabled.push(plugin.id);
        return;
      }
      register.push(plugin);
    });
  } catch (e) {
    console.error(e);
  }
  {{/each}}

  // Add the dynamic extensions.
  dynamicPlugins.forEach(plugin => { register.push(plugin) });

  var lab = new JupyterLab({
    mimeExtensions: mimeExtensions,
    disabled: {
      matches: disabled,
      patterns: PageConfig.Extension.disabled
        .map(function (val) { return val.raw; })
    },
    deferred: {
      matches: deferred,
      patterns: PageConfig.Extension.deferred
        .map(function (val) { return val.raw; })
    },
  });
  register.forEach(function(item) { lab.registerPluginModule(item); });
  lab.start({ ignorePlugins: ignorePlugins });
  lab.restored.then(() => {
    console.debug('Example started!');
  });
}

window.addEventListener('load', main);
