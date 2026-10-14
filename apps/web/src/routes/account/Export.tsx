import type { ExportFormat } from '@netnet/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { downloadExport } from '../../api/export';
import { Button, Card, FormProblem } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Export.module.css';

/**
 * Export (Account → Export everything, the prototype's `#/sub/export`): the person's data to take
 * away. JSON is the full bundle; CSV is one flat values table for a spreadsheet.
 */
export function Export() {
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [problem, setProblem] = useState<string>();

  const download = async (format: ExportFormat) => {
    if (downloading !== null) return;
    setDownloading(format);
    setProblem(undefined);
    try {
      await downloadExport(format);
    } catch (error) {
      setProblem(failureSentence(error));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/account" className={styles.iconButton} aria-label="Back to Account">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>Export</h1>
        <span className={styles.spacer} />
      </div>

      <div className={styles.body}>
        <Card>
          <div className={styles.copy}>
            <h2 className={styles.heading}>Everything, in one file</h2>
            <p className={styles.text}>
              Every holding and its full history, including original currencies and the rates used.
            </p>
            <div className={styles.actions}>
              <Button
                aria-disabled={downloading !== null || undefined}
                onClick={() => void download('json')}
              >
                {downloading === 'json' ? 'Downloading…' : 'Download JSON'}
              </Button>
              <Button
                variant="quiet"
                aria-disabled={downloading !== null || undefined}
                onClick={() => void download('csv')}
              >
                {downloading === 'csv' ? 'Downloading…' : 'Download CSV instead'}
              </Button>
            </div>
          </div>
        </Card>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </>
  );
}
