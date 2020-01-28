// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette,
  MainAreaWidget,
  WidgetTracker
} from '@jupyterlab/apputils';

import { IEditorServices } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { Session } from '@jupyterlab/services';

import { Debugger } from './debugger';

import { TrackerHandler } from './handlers/tracker';

import { DebuggerService } from './service';

import { DebuggerHandler } from './handler';

import { IDebugger } from './tokens';

import { VariableTest } from './variables/table';

import { DebuggerModel } from './model';

/**
 * The command IDs used by the debugger plugin.
 */
export namespace CommandIDs {
  export const start = 'debugger:start';

  export const stop = 'debugger:stop';

  export const debugContinue = 'debugger:continue';

  export const terminate = 'debugger:terminate';

  export const next = 'debugger:next';

  export const stepIn = 'debugger:stepIn';

  export const stepOut = 'debugger:stepOut';

  export const addDetials = 'debugger:variableDetials';
}

/**
 * A plugin that provides visual debugging support for consoles.
 */
const consoles: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger:consoles',
  autoStart: true,
  requires: [IDebugger, IConsoleTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    consoleTracker: IConsoleTracker,
    labShell: ILabShell
  ) => {
    const handler = new DebuggerHandler({
      type: 'console',
      shell: app.shell,
      service: debug
    });
    debug.model.disposed.connect(() => {
      handler.disposeAll(debug);
    });

    const updateHandlerAndCommands = async (widget: ConsolePanel) => {
      const sessionContext = widget.sessionContext;
      await sessionContext.ready;
      await handler.update(widget, sessionContext.session);
      app.commands.notifyCommandChanged();
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof ConsolePanel)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
      return;
    }

    consoleTracker.currentChanged.connect(async (_, consolePanel) => {
      await updateHandlerAndCommands(consolePanel);
    });
  }
};

/**
 * A plugin that provides visual debugging support for file editors.
 */
const files: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger:files',
  autoStart: true,
  requires: [IDebugger, IEditorTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    editorTracker: IEditorTracker,
    labShell: ILabShell
  ) => {
    const handler = new DebuggerHandler({
      type: 'file',
      shell: app.shell,
      service: debug
    });
    debug.model.disposed.connect(() => {
      handler.disposeAll(debug);
    });

    const activeSessions: {
      [id: string]: Session.ISessionConnection;
    } = {};

    const updateHandlerAndCommands = async (widget: DocumentWidget) => {
      const sessions = app.serviceManager.sessions;
      try {
        const model = await sessions.findByPath(widget.context.path);
        let session = activeSessions[model.id];
        if (!session) {
          // Use `connectTo` only if the session does not exist.
          // `connectTo` sends a kernel_info_request on the shell
          // channel, which blocks the debug session restore when waiting
          // for the kernel to be ready
          session = sessions.connectTo({ model });
          activeSessions[model.id] = session;
        }
        await handler.update(widget, session);
        app.commands.notifyCommandChanged();
      } catch {
        return;
      }
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof DocumentWidget)) {
          return;
        }

        const content = widget.content;
        if (!(content instanceof FileEditor)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
    }

    editorTracker.currentChanged.connect(async (_, documentWidget) => {
      await updateHandlerAndCommands(
        (documentWidget as unknown) as DocumentWidget
      );
    });
  }
};

/**
 * A plugin that provides visual debugging support for notebooks.
 */
const notebooks: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger:notebooks',
  autoStart: true,
  requires: [IDebugger, INotebookTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    notebookTracker: INotebookTracker,
    labShell: ILabShell
  ) => {
    const handler = new DebuggerHandler({
      type: 'notebook',
      shell: app.shell,
      service: debug
    });
    debug.model.disposed.connect(() => {
      handler.disposeAll(debug);
    });

    const updateHandlerAndCommands = async (widget: NotebookPanel) => {
      const sessionContext = widget.sessionContext;
      await sessionContext.ready;
      await handler.update(widget, sessionContext.session);
      app.commands.notifyCommandChanged();
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof NotebookPanel)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
      return;
    }

    notebookTracker.currentChanged.connect(
      async (_, notebookPanel: NotebookPanel) => {
        await updateHandlerAndCommands(notebookPanel);
      }
    );
  }
};

/**
 * A plugin that tracks notebook, console and file editors used for debugging.
 */
const tracker: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger:tracker',
  autoStart: true,
  requires: [IDebugger, IEditorServices],
  optional: [INotebookTracker, IConsoleTracker, IEditorTracker],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    editorServices: IEditorServices,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker,
    editorTracker: IEditorTracker
  ) => {
    new TrackerHandler({
      shell: app.shell,
      editorServices,
      debuggerService: debug,
      notebookTracker,
      consoleTracker,
      editorTracker
    });
  }
};

/**
 * TODO:
 * A plugin for add widget with detial of veriable.
 */

/**
 * A plugin providing a tracker code debuggers.
 */
const main: JupyterFrontEndPlugin<IDebugger> = {
  id: '@jupyterlab/debugger:main',
  requires: [IEditorServices],
  optional: [ILayoutRestorer, ICommandPalette],
  provides: IDebugger,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    editorServices: IEditorServices,
    restorer: ILayoutRestorer | null,
    palette: ICommandPalette | null
  ): IDebugger => {
    const { commands, shell } = app;

    const service = new DebuggerService();
    const detailsTracker = new WidgetTracker<MainAreaWidget<VariableTest>>({
      namespace: 'variableDetails'
    });

    commands.addCommand(CommandIDs.addDetials, {
      label: 'Continue',
      caption: 'Continue',
      execute: async args => {
        const { variableReference, title } = args;
        if (!variableReference || variableReference === 0) {
          return;
        }
        const details = await service.getVariableDetails(
          variableReference as number
        );
        if (!details || details.length === 0) {
          return;
        }

        const id = `jp-debugger-details-${title}`;
        if (detailsTracker.find(widget => widget.id === id)) {
          return;
        }
        const commands = variableCommands;
        const model = (service.model as DebuggerModel).variables;
        const opt: DocumentRegistry.IOpenOptions = {
          mode: detailsTracker.currentWidget ? 'split-right' : 'split-bottom'
        };
        const widget = new VariableTest({ service, commands, details, model });
        widget.title.label = `${
          service.session?.connection?.name
        } - details of ${title as string}`;
        widget.title.iconClass = 'jp-VariableIcon';
        widget.addClass('jp-debugger-details');
        const newM = new MainAreaWidget<VariableTest>({ content: widget });
        newM.id = id;
        void detailsTracker.add(newM);
        shell.add(newM, 'main', opt);
      }
    });

    commands.addCommand(CommandIDs.debugContinue, {
      label: 'Continue',
      caption: 'Continue',
      iconClass: 'jp-MaterialIcon jp-RunIcon',
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.continue();
        commands.notifyCommandChanged();
      }
    });

    commands.addCommand(CommandIDs.terminate, {
      label: 'Terminate',
      caption: 'Terminate',
      iconClass: 'jp-MaterialIcon jp-StopIcon',
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.restart();
        commands.notifyCommandChanged();
      }
    });

    commands.addCommand(CommandIDs.next, {
      label: 'Next',
      caption: 'Next',
      iconClass: 'jp-MaterialIcon jp-StepOverIcon',
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.next();
      }
    });

    commands.addCommand(CommandIDs.stepIn, {
      label: 'StepIn',
      caption: 'Step In',
      iconClass: 'jp-MaterialIcon jp-StepInIcon',
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.stepIn();
      }
    });

    commands.addCommand(CommandIDs.stepOut, {
      label: 'StepOut',
      caption: 'Step Out',
      iconClass: 'jp-MaterialIcon jp-StepOutIcon',
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.stepOut();
      }
    });

    const callstackCommands = {
      registry: commands,
      continue: CommandIDs.debugContinue,
      terminate: CommandIDs.terminate,
      next: CommandIDs.next,
      stepIn: CommandIDs.stepIn,
      stepOut: CommandIDs.stepOut
    };

    const variableCommands = {
      registry: commands,
      details: CommandIDs.addDetials
    };

    const sidebar = new Debugger.Sidebar({
      service,
      callstackCommands,
      variableCommands,
      editorServices
    });

    sidebar.service.eventMessage.connect(_ => {
      commands.notifyCommandChanged();
    });

    sidebar.service.sessionChanged.connect(_ => {
      commands.notifyCommandChanged();
    });

    if (restorer) {
      restorer.add(sidebar, 'debugger-sidebar');
    }

    shell.add(sidebar, 'right');

    if (palette) {
      const category = 'Debugger';
      [
        CommandIDs.debugContinue,
        CommandIDs.terminate,
        CommandIDs.next,
        CommandIDs.stepIn,
        CommandIDs.stepOut
      ].forEach(command => {
        palette.addItem({ command, category });
      });
    }

    return service;
  }
};

/**
 * Export the plugins as default.
 */

const plugins: JupyterFrontEndPlugin<any>[] = [
  consoles,
  files,
  notebooks,
  tracker,
  main
];

export default plugins;
