import { View } from 'react-native';
import { makeStyles } from '@/shared/theme';
import { IconButton, TextField } from '@/shared/ui';

/** Search box with a clear button, shared by every level of the saves vault. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <TextField
        value={value}
        onChangeText={onChange}
        icon="search"
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.input}
      />
      {value ? (
        <View style={styles.clear}>
          <IconButton
            icon="close-circle"
            size={18}
            color="textSubtle"
            accessibilityLabel="Clear search"
            onPress={() => onChange('')}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { justifyContent: 'center' },
  input: { paddingRight: 44 },
  clear: { position: 'absolute', right: 6 },
}));
