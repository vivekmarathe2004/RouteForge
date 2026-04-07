const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  };
}

function createSupabaseAdminClient() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }

  return createClient(config.supabaseUrl, config.supabaseSecretKey, clientOptions());
}

function createSupabaseAuthClient() {
  if (!config.supabaseUrl || !config.supabaseAuthKey) {
    throw new Error("SUPABASE_URL and a Supabase auth key are required.");
  }

  return createClient(config.supabaseUrl, config.supabaseAuthKey, clientOptions());
}

module.exports = {
  createSupabaseAdminClient,
  createSupabaseAuthClient
};
