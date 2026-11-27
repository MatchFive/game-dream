import { useState } from 'react';
import { api } from '../api/client';
import { Icon } from './Sprite';
import { useToast } from './Toast';
import { useI18n } from '../i18n';

interface PathFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  kind: 'file' | 'folder';
  filter?: string;
  onChange: (value: string) => void;
}

/** 路径输入 + 原生选择器（/api/dialog，仅 localhost 可用）。 */
export function PathField({ label, value, placeholder, kind, filter, onChange }: PathFieldProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true);
    try {
      const result = await api.choosePath({ kind, filter, title: label });
      if (result.path) onChange(result.path);
    } catch (error) {
      const message = String((error as Error).message);
      toast.push(
        /unknown.*api|404/i.test(message) ? t('settings.pickerStale') : t('settings.pickerFailed', { message }),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="settings-field">
      <span>{label}</span>
      <div className="path-input">
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        <button className="button secondary" type="button" disabled={busy} onClick={() => void pick()}>
          {busy ? t('settings.picking') : t('settings.browse')}
        </button>
      </div>
    </label>
  );
}

interface PathListProps {
  label: string;
  values: string[];
  kind: 'file' | 'folder';
  filter?: string;
  addLabel: string;
  onChange: (values: string[]) => void;
}

/** 目录/文件列表：逐条选择、去重、可删除。 */
export function PathListField({ label, values, kind, filter, addLabel, onChange }: PathListProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const result = await api.choosePath({ kind, filter, title: label });
      if (result.path && !values.includes(result.path)) onChange([...values, result.path]);
    } catch (error) {
      const message = String((error as Error).message);
      toast.push(
        /unknown.*api|404/i.test(message) ? t('settings.pickerStale') : t('settings.pickerFailed', { message }),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-field">
      <div className="settings-field-head">
        <span>{label}</span>
        <button className="button secondary path-add" type="button" disabled={busy} onClick={() => void add()}>
          {busy ? t('settings.picking') : addLabel}
        </button>
      </div>
      <div className="path-list">
        {values.length === 0 && <div className="path-empty">{t('settings.noPaths')}</div>}
        {values.map((value, index) => (
          <div className="path-row" key={value}>
            <code>{value}</code>
            <button
              type="button"
              aria-label={t('common.remove')}
              onClick={() => onChange(values.filter((_, position) => position !== index))}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
