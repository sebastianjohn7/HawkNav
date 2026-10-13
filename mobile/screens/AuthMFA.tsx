import { useState } from 'react';
import {
  ActivityIndicator,
    Button,
    Text,
    TextInput,
    View,
} from 'react-native';
import { supabase } from '../lib/config';   

type Props = {
    onVerified: () => void;
};
export function AuthMFA({ onVerified }: Props) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');




    async function verifyMFA() {
        if (loading) return;

        if(!supabase) {
            setError('Supabase client is not initialized');
            return;
        }
        if (!/^\d{6}$/.test(code.trim())) {
            setError("Enter a valid 6-digit code.");
            return;
        }
        setLoading(true);
        setError('');


        try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;

            const factor = data.totp.find(f => f.status === 'verified');
            if (!factor) {
                setError('No verified MFA factor found. Please enroll first.');
                setLoading(false);
                return;
            }
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                factorId: factor.id,
                code: code.trim(),
            });
            if (verifyError) throw verifyError;

            onVerified();
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'MFA verification failed.'
            );
        } finally {
            setLoading(false);
        }

    }

    return (
        <View style={{ padding: 20 }}>
            <Text>Enter the 6-digit code from your authenticator app:</Text>
            <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="numeric"
                maxLength={6}
                style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    padding: 10,
                    marginVertical: 10,
                }}
            />
            {error !== '' && <Text style={{ color: 'red' }}>{error}</Text>}
            <Button title={loading ? 'Verifying...' : 'Verify'} onPress={verifyMFA} disabled={loading} />
        </View>
    );
}
            

           
      
