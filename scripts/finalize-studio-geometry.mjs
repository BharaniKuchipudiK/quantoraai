import fs from 'node:fs';

function edit(path, transform) {
  const original = fs.readFileSync(path, 'utf8');
  const next = transform(original);
  if (next === original) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, next);
}

function replaceOnce(source, label, before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Marker not found for ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Ambiguous marker for ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

edit('src/components/Header.jsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'external profile anchor state',
    "  const [profileMenuPosition, setProfileMenuPosition] = useState(null);\n",
    "  const [profileMenuPosition, setProfileMenuPosition] = useState(null);\n  const [externalProfileAnchor, setExternalProfileAnchor] = useState(null);\n",
  );
  source = replaceOnce(
    source,
    'profile menu positioning',
    `  const positionProfileMenu = useCallback(() => {\n    const anchor = profileRef.current;\n    if (!anchor || typeof window === 'undefined') return;\n    const rect = anchor.getBoundingClientRect();\n    const headerBottom = anchor.closest('.app-header')?.getBoundingClientRect().bottom ?? rect.bottom;\n    const width = Math.min(PROFILE_MENU_WIDTH, window.innerWidth - (PROFILE_MENU_GUTTER * 2));\n    const left = Math.min(\n      Math.max(PROFILE_MENU_GUTTER, rect.right - width),\n      window.innerWidth - width - PROFILE_MENU_GUTTER,\n    );\n    const top = Math.max(rect.bottom, headerBottom) + 8;\n    setProfileMenuPosition({\n      top,\n      left,\n      width,\n      maxHeight: Math.max(180, window.innerHeight - top - PROFILE_MENU_GUTTER),\n    });\n  }, []);`,
    `  const positionProfileMenu = useCallback(() => {\n    if (typeof window === 'undefined') return;\n    const headerAnchor = profileRef.current;\n    const rect = externalProfileAnchor || headerAnchor?.getBoundingClientRect?.();\n    if (!rect) return;\n    const width = Math.min(PROFILE_MENU_WIDTH, window.innerWidth - (PROFILE_MENU_GUTTER * 2));\n\n    if (externalProfileAnchor) {\n      const roomOnRight = window.innerWidth - rect.right - PROFILE_MENU_GUTTER;\n      const left = roomOnRight >= width\n        ? rect.right + 10\n        : Math.max(PROFILE_MENU_GUTTER, rect.left - width - 10);\n      const desiredHeight = Math.min(560, window.innerHeight - (PROFILE_MENU_GUTTER * 2));\n      const top = Math.max(\n        PROFILE_MENU_GUTTER,\n        Math.min(rect.bottom - desiredHeight, window.innerHeight - desiredHeight - PROFILE_MENU_GUTTER),\n      );\n      setProfileMenuPosition({ top, left, width, maxHeight: desiredHeight });\n      return;\n    }\n\n    const headerBottom = headerAnchor?.closest('.app-header')?.getBoundingClientRect().bottom ?? rect.bottom;\n    const left = Math.min(\n      Math.max(PROFILE_MENU_GUTTER, rect.right - width),\n      window.innerWidth - width - PROFILE_MENU_GUTTER,\n    );\n    const top = Math.max(rect.bottom, headerBottom) + 8;\n    setProfileMenuPosition({\n      top,\n      left,\n      width,\n      maxHeight: Math.max(180, window.innerHeight - top - PROFILE_MENU_GUTTER),\n    });\n  }, [externalProfileAnchor]);`,
  );
  source = replaceOnce(
    source,
    'external profile event',
    `  useEffect(() => {\n    const openProfile = () => {\n      setShowModelDropdown(false);\n      setShowProfileMenu(true);\n    };\n    window.addEventListener('quantora:open-profile-menu', openProfile);\n    return () => window.removeEventListener('quantora:open-profile-menu', openProfile);\n  }, []);`,
    `  useEffect(() => {\n    const openProfile = (event) => {\n      const rect = event?.detail?.anchorRect;\n      setExternalProfileAnchor(rect && Number.isFinite(rect.left)\n        ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }\n        : null);\n      setShowModelDropdown(false);\n      setShowProfileMenu(true);\n    };\n    window.addEventListener('quantora:open-profile-menu', openProfile);\n    return () => window.removeEventListener('quantora:open-profile-menu', openProfile);\n  }, []);`,
  );
  source = replaceOnce(
    source,
    'clear external anchor',
    `    if (!showProfileMenu) {\n      setProfileMenuPosition(null);\n      return undefined;\n    }`,
    `    if (!showProfileMenu) {\n      setProfileMenuPosition(null);\n      setExternalProfileAnchor(null);\n      return undefined;\n    }`,
  );
  return source;
});

edit('src/components/AiStudio.jsx', (input) => replaceOnce(
  input,
  'sidebar profile anchor event',
  `            onClick={() => window.dispatchEvent(new CustomEvent('quantora:open-profile-menu'))}`,
  `            onClick={(event) => {\n              const rect = event.currentTarget.getBoundingClientRect();\n              window.dispatchEvent(new CustomEvent('quantora:open-profile-menu', {\n                detail: { anchorRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } },\n              }));\n            }}`,
));

console.log('Studio profile geometry finalization applied.');
