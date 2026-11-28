import type { ComponentProps } from 'react';

type InputProps = Pick<ComponentProps<'input'>, 'name' | 'defaultValue' | 'required' | 'placeholder'>;

function allowExistingValue(pattern: string, value: InputProps['defaultValue']) {
  if (typeof value !== 'string' || !value || new RegExp('^(?:' + pattern + ')$', 'u').test(value)) return pattern;
  const exactValue = Array.from(value, character => '\\u{' + character.codePointAt(0)!.toString(16) + '}').join('');
  return pattern + '|' + exactValue;
}

export function PatientNameInput(props: InputProps) {
  return <input {...props} maxLength={80} pattern={allowExistingValue('\\p{L}[\\p{L}\\p{M}]*', props.defaultValue)}
    title="Use letters only"
    onChange={event => {
      const input = event.currentTarget;
      const letters = input.value.replace(/[^\p{L}\p{M}]/gu, '').replace(/^\p{M}+/u, '');
      if (input.value !== letters) input.value = letters;
    }} />;
}

export function PatientDigitsInput(props: InputProps) {
  const isAge = props.name === 'age';
  return <input {...props} inputMode={isAge ? 'numeric' : 'tel'}
    pattern={allowExistingValue(isAge ? '[0-9]{1,3}' : '\\+?[0-9]{7,13}', props.defaultValue)}
    maxLength={isAge ? 3 : 14}
    title={isAge ? 'Enter up to 3 digits' : 'Enter 7 to 13 digits, optionally starting with +'}
    onChange={event => {
      const input = event.currentTarget;
      const prefix = !isAge && input.value.startsWith('+') ? '+' : '';
      const value = prefix + input.value.replace(/[^0-9]/g, '').slice(0, isAge ? 3 : 13);
      if (input.value !== value) input.value = value;
    }} />;
}

export function PatientAllergyInput({ value }: { value?: string | null }) {
  const existing = value?.trim();
  const choice = !existing ? undefined : existing.toLowerCase() === 'no' ? 'No' : 'Yes';
  const details = choice === 'Yes' && existing?.toLowerCase() !== 'yes' ? value ?? '' : '';
  return <fieldset className="patient-allergies">
    <legend>Allergies</legend>
    <div className="patient-allergy-options">
      {['Yes', 'No'].map(option => <label key={option}>
        <input type="radio" name="allergyChoice" value={option} defaultChecked={choice === option} />
        {option}
      </label>)}
    </div>
    <label className="patient-allergy-details">Allergy details
      <input name="allergyDetails" maxLength={2000} defaultValue={details} />
    </label>
  </fieldset>;
}

export function readPatientAllergies(form: FormData) {
  const choice = form.get('allergyChoice');
  if (choice === 'Yes') return String(form.get('allergyDetails') ?? '').trim() || 'Yes';
  return choice === 'No' ? 'No' : null;
}
