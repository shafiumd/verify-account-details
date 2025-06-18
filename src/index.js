// verify-account-details-function/src/index.js
const axios = require('axios');
// const { Client } /* if you needed Appwrite SDK */ = require('node-appwrite');

module.exports = async (req, res) => {
  // Access environment variables securely
  const paystackSecretKey = req.variables.PAYSTACK_SECRET_KEY;
  // const appwriteEndpoint = req.variables.APPWRITE_ENDPOINT;
  // const appwriteProjectId = req.variables.APPWRITE_PROJECT_ID;
  // const appwriteApiKey = req.variables.APPWRITE_API_KEY;

  if (!paystackSecretKey) {
    console.error("PAYSTACK_SECRET_KEY is not set in environment variables.");
    return res.json({ success: false, message: "Server configuration error: Missing Paystack key." }, 500);
  }

  try {
    const { accountNumber } = JSON.parse(req.payload);

    if (!accountNumber || typeof accountNumber !== 'string' || accountNumber.length !== 10) {
      return res.json({ success: false, message: "Invalid account number provided. It must be a 10-digit string." }, 400);
    }

    // --- PAYSTACK ACCOUNT RESOLUTION ---
    // Paystack's "Resolve Account Number" API endpoint requires a bank_code.
    // This is a challenge if you *only* have the account number.
    //
    // Possible Solutions:
    // 1. Ask the user for their bank. (You removed this from UI).
    // 2. Try resolving against a list of common bank codes (can be slow, error-prone).
    // 3. Use a third-party service that can resolve NUBAN without bank code (might have costs).
    // 4. For now, let's assume we'll try a few common bank codes.
    //    In a real app, this list should be fetched dynamically or be more comprehensive.

    const commonBankCodes = [
        "058", // GTB
        "011", // First Bank
        "033", // UBA
        "057", // Zenith
        "044", // Access
        "070", // Fidelity
        "214", // FCMB
        // Add more as needed
    ];

    let resolvedName = null;
    let foundBankCode = null;

    for (const bankCode of commonBankCodes) {
      try {
        console.log(`Trying to resolve ${accountNumber} with bank code ${bankCode}`);
        const paystackResponse = await axios.get(
          `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
          {
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000 // 5 second timeout per request
          }
        );

        if (paystackResponse.data && paystackResponse.data.status === true) {
          resolvedName = paystackResponse.data.data.account_name;
          foundBankCode = paystackResponse.data.data.bank_id; // Paystack returns bank_id, not code
          console.log(`Resolved: ${resolvedName} for bank ID ${foundBankCode}`);
          break; // Found it, exit loop
        }
      } catch (loopError) {
        // Log error for this specific bank code attempt but continue loop
        if (loopError.response) {
            console.warn(`Paystack error for bank ${bankCode}: ${loopError.response.status} - ${loopError.response.data ? JSON.stringify(loopError.response.data) : loopError.message}`);
        } else {
            console.warn(`Paystack request failed for bank ${bankCode}: ${loopError.message}`);
        }
      }
    }

    if (resolvedName) {
      res.json({ success: true, accountName: resolvedName, /* bankId: foundBankCode (optional) */ });
    } else {
      res.json({ success: false, message: "Could not verify account details with common banks. Please check the number or try again later." }, 404);
    }

  } catch (error) {
    console.error("Critical error in verify-account-details function:", error.message);
    // Avoid sending detailed internal errors to client unless necessary
    res.json({ success: false, message: "An unexpected error occurred during verification." }, 500);
  }
};