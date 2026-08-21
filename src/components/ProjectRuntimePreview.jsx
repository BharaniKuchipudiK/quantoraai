import React, { useMemo } from 'react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react';
import { projectRuntimeConfig } from '../lib/project-runtime-preview.js';

export default function ProjectRuntimePreview({ vfs }) {
  const config = useMemo(() => projectRuntimeConfig(vfs), [vfs]);
  if (!config) return null;

  return (
    <div data-quantora-real-project-preview="true" style={{ width: '100%', height: '100%', minHeight: 0, background: '#ffffff' }}>
      <SandpackProvider
        template={config.template}
        files={config.files}
        customSetup={{ dependencies: config.dependencies }}
      >
        <div style={{ width: '100%', height: '100%', minHeight: 0 }}>
          <SandpackPreview
            showNavigator={false}
            showRefreshButton
            showOpenInCodeSandbox={false}
            style={{ width: '100%', height: '100%', minHeight: '100%' }}
          />
        </div>
      </SandpackProvider>
    </div>
  );
}
