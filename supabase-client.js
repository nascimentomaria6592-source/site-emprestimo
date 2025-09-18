const { createClient } = require('@supabase/supabase-js');

// As variáveis de ambiente que você acabou de configurar no Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Verificação para garantir que as variáveis foram carregadas
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Erro Crítico: Variáveis de ambiente do Supabase (URL e Anon Key) não foram encontradas.');
    console.error('Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão configuradas no seu ambiente.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;
