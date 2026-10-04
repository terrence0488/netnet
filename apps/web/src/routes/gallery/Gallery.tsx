import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import {
  Button,
  Card,
  Choice,
  ErrorState,
  Figure,
  MoneyField,
  PasswordField,
  Picker,
  Rule,
  Sheet,
  Spinner,
  TextField,
  Wordmark,
  useToast,
} from '../../components';
import styles from './Gallery.module.css';

/**
 * Every base component in each of its states, for the E2E suite to check in both themes (it is
 * left out of production builds). All data is fictional.
 */

const KINDS = [
  { value: 'asset', label: 'Something I own' },
  { value: 'liability', label: 'Something I owe' },
];

const OFFLINE = new ApiError({ code: 'NETWORK', status: 0, message: 'Gallery specimen.' });

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  const id = `gallery-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className={styles.specimen} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

export function Gallery() {
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('Travel fund');
  const [kind, setKind] = useState('asset');
  const [amount, setAmount] = useState('1,250.50');
  const [yen, setYen] = useState('1250.5');
  const [sheetAmount, setSheetAmount] = useState('');
  const [place, setPlace] = useState<string | null>('here');
  const [stage, setStage] = useState<string | null>(null);

  return (
    <>
      <header className={styles.top}>
        <h1>Gallery</h1>
      </header>
      <div className={styles.grid}>
        <Specimen title="Buttons">
          <div className={styles.stack}>
            <div className={styles.row}>
              <Button onClick={() => toast.show({ message: 'Primary pressed.' })}>
                Add what you have
              </Button>
              <Button variant="outlined">Connect to agent</Button>
              <Button variant="quiet">Not now</Button>
              <Button
                aria-disabled
                data-testid="unavailable"
                onClick={() => toast.show({ message: 'This should never show.' })}
              >
                Save
              </Button>
            </div>
            <Button block>Save the value</Button>
          </div>
        </Specimen>

        <Specimen title="Fields">
          <form className={styles.stack} onSubmit={(event) => event.preventDefault()}>
            <TextField
              label="Name"
              hint="What you call it."
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField label="Email" type="email" defaultValue="avery@example.com" />
            <TextField label="Password" type="password" error="Use at least 10 characters." />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              hint="At least 8 characters."
              defaultValue="correct horse"
            />
            <Picker label="Kind" options={KINDS} value={kind} onChange={setKind} />
            <MoneyField
              label="Amount"
              currency="SGD"
              locale="en-SG"
              value={amount}
              onChange={setAmount}
            />
            <MoneyField
              label="Amount"
              currency="JPY"
              locale="en-SG"
              value={yen}
              onChange={setYen}
            />
          </form>
        </Specimen>

        <Specimen title="Choices">
          <div className={styles.stack}>
            <p id="gallery-choice-row">Is this where you live?</p>
            <Choice
              labelledBy="gallery-choice-row"
              options={[
                { value: 'here', label: 'Singapore' },
                { value: 'elsewhere', label: 'Somewhere else' },
              ]}
              value={place}
              onChange={setPlace}
            />
            <p id="gallery-choice-stacked">Which is closest to you?</p>
            <Choice
              stacked
              labelledBy="gallery-choice-stacked"
              options={[
                { value: 'start', label: 'Just starting out' },
                { value: 'build', label: 'Building up — saving toward something big' },
              ]}
              value={stage}
              onChange={(value) => setStage(value === stage ? null : value)}
            />
          </div>
        </Specimen>

        <Specimen title="Figures">
          <dl className={styles.figures}>
            <dt>Total</dt>
            <dd>
              <Figure size="display" minor={79_799_253} currency="SGD" locale="en-SG" total />
            </dd>
            <dt>Row amount</dt>
            <dd>
              <Figure minor={2_810_053} currency="SGD" locale="en-SG" />
            </dd>
            <dt>Gain</dt>
            <dd>
              <Figure size="change" minor={5_900_000} currency="SGD" locale="en-SG" total />
            </dd>
            <dt>Loss</dt>
            <dd>
              <Figure size="change" minor={-120_000} currency="SGD" locale="en-SG" total />
            </dd>
            <dt>Unchanged</dt>
            <dd data-testid="unchanged">
              <Figure size="change" minor={0} currency="SGD" locale="en-SG" />
            </dd>
          </dl>
          <p className={styles.sentence}>
            Counts toward the{' '}
            <Figure size="inline" minor={1_820_000} currency="SGD" locale="en-SG" total /> you could
            use this month.
          </p>
        </Specimen>

        <Specimen title="Rules">
          <div className={styles.stack}>
            <Rule />
            <Rule variant="strong" />
            <Rule variant="dashed" />
          </div>
        </Specimen>

        <Specimen title="Sheet and toast">
          <div className={styles.row}>
            <Button variant="outlined" onClick={() => setSheetOpen(true)}>
              Open the sheet
            </Button>
            <Button
              variant="outlined"
              onClick={() =>
                toast.show({
                  message: 'Value saved.',
                  action: { label: 'Undo', onAction: () => toast.show({ message: 'Undone.' }) },
                })
              }
            >
              Show a toast
            </Button>
          </div>
        </Specimen>

        <Specimen title="Waiting">
          <Spinner />
        </Specimen>

        <Specimen title="Wordmark">
          <Wordmark />
        </Specimen>

        <Specimen title="Error">
          <ErrorState error={OFFLINE} onRetry={() => toast.show({ message: 'Trying again.' })} />
        </Specimen>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add a value"
        action={{ label: 'Save', onAction: () => setSheetOpen(false), unavailable: !sheetAmount }}
        footer={
          <Button block onClick={() => setSheetOpen(false)}>
            Save the value
          </Button>
        }
      >
        <MoneyField
          label="Amount"
          currency="SGD"
          locale="en-SG"
          value={sheetAmount}
          onChange={setSheetAmount}
        />
      </Sheet>
    </>
  );
}
