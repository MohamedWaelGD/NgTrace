import { describe, expect, it } from 'vitest';
import { EDITOR_PRESETS, editorTemplate, editorUrl, sourceUrlCandidates } from './source';

describe('sourceUrlCandidates', () => {
  it('tries the origin, webpack and Vite /@fs URLs for a workspace-relative path', () => {
    expect(sourceUrlCandidates('http://localhost:4200', 'src/app/shop.component.ts')).toEqual([
      'http://localhost:4200/src/app/shop.component.ts',
      'webpack:///src/app/shop.component.ts',
      'webpack:///./src/app/shop.component.ts',
      'http://localhost:4200/@fs/src/app/shop.component.ts',
    ]);
  });

  it('normalises Windows separators and leading ./', () => {
    expect(sourceUrlCandidates('http://localhost:4200', '.\\src\\app\\a.ts')[0]).toBe('http://localhost:4200/src/app/a.ts');
  });

  it('keeps an absolute path whole for Vite /@fs', () => {
    expect(sourceUrlCandidates('http://localhost:5173', '/home/me/proj/src/a.ts')).toContain('http://localhost:5173/@fs/home/me/proj/src/a.ts');
    expect(sourceUrlCandidates('http://localhost:5173', 'C:\\proj\\src\\a.ts')).toContain('http://localhost:5173/@fs/C:/proj/src/a.ts');
  });
});

describe('editorUrl', () => {
  const at = { file: 'src/app/shop component.ts', line: 12, column: 1 };
  const windows = { ...at, root: 'C:\\Users\\me\\proj\\' };
  const posix = { ...at, root: '/home/me/proj' };

  const expected: Record<string, [string, string]> = {
    vscode: ['vscode://file/C:/Users/me/proj/src/app/shop%20component.ts:12:1', 'vscode://file/home/me/proj/src/app/shop%20component.ts:12:1'],
    'vscode-insiders': [
      'vscode-insiders://file/C:/Users/me/proj/src/app/shop%20component.ts:12:1',
      'vscode-insiders://file/home/me/proj/src/app/shop%20component.ts:12:1',
    ],
    cursor: ['cursor://file/C:/Users/me/proj/src/app/shop%20component.ts:12:1', 'cursor://file/home/me/proj/src/app/shop%20component.ts:12:1'],
    windsurf: ['windsurf://file/C:/Users/me/proj/src/app/shop%20component.ts:12:1', 'windsurf://file/home/me/proj/src/app/shop%20component.ts:12:1'],
    zed: ['zed://file/C:/Users/me/proj/src/app/shop%20component.ts:12:1', 'zed://file/home/me/proj/src/app/shop%20component.ts:12:1'],
    webstorm: [
      'webstorm://open?file=C:/Users/me/proj/src/app/shop%20component.ts&line=12&column=1',
      'webstorm://open?file=/home/me/proj/src/app/shop%20component.ts&line=12&column=1',
    ],
    idea: [
      'idea://open?file=C:/Users/me/proj/src/app/shop%20component.ts&line=12&column=1',
      'idea://open?file=/home/me/proj/src/app/shop%20component.ts&line=12&column=1',
    ],
    sublime: [
      'subl://open?url=file:///C:/Users/me/proj/src/app/shop%20component.ts&line=12&column=1',
      'subl://open?url=file:///home/me/proj/src/app/shop%20component.ts&line=12&column=1',
    ],
  };

  for (const preset of EDITOR_PRESETS.filter((p) => p.id !== 'custom')) {
    it(`renders ${preset.label} for a Windows and a POSIX root`, () => {
      expect(editorUrl(preset.template, windows)).toBe(expected[preset.id][0]);
      expect(editorUrl(preset.template, posix)).toBe(expected[preset.id][1]);
    });
  }

  it('uses a custom template as given', () => {
    expect(editorUrl('myeditor://{file}?root={root}&l={line}', posix)).toBe('myeditor://src/app/shop%20component.ts?root=/home/me/proj&l=12');
  });

  it('resolves the template of a preset id, or the custom template', () => {
    expect(editorTemplate({ editor: 'zed' })).toBe(EDITOR_PRESETS.find((p) => p.id === 'zed')!.template);
    expect(editorTemplate({ editor: 'custom', customTemplate: 'x://{file}' })).toBe('x://{file}');
    expect(editorTemplate({})).toBe(EDITOR_PRESETS[0].template);
  });
});
