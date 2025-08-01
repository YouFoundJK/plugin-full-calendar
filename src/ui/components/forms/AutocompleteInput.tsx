/**
 * @file AutocompleteInput.tsx
 * @brief A reusable text input component with autocomplete/datalist functionality.
 *
 * @description
 * This component renders an <input> element along with a <datalist> to provide
 * native browser autocomplete suggestions.
 *
 * @license See LICENSE.md
 */

interface AutocompleteInputProps {
  value: string;
  onChange: (newValue: string) => void;
  suggestions: string[];
  id: string; // Used to link input to datalist
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export const AutocompleteInput = ({
  value,
  onChange,
  suggestions,
  id,
  placeholder,
  disabled,
  readOnly
}: AutocompleteInputProps) => {
  return (
    <>
      <input
        type="text"
        list={id}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
      />
      <datalist id={id}>
        {suggestions.map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
};
