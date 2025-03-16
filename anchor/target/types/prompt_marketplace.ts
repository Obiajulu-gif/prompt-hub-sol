/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/prompt_marketplace.json`.
 */
export type PromptMarketplace = {
  "address": "Fe9igk7LXXkMC595krcFp3GR78wTFts5qMDzjTW83Jfh",
  "metadata": {
    "name": "promptMarketplace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closeListing",
      "discriminator": [
        33,
        15,
        192,
        81,
        78,
        175,
        159,
        97
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "user",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createListing",
      "discriminator": [
        18,
        168,
        45,
        24,
        191,
        31,
        117,
        54
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "category",
          "type": "string"
        },
        {
          "name": "fileHash",
          "type": "string"
        }
      ]
    },
    {
      "name": "purchasePrompt",
      "discriminator": [
        15,
        39,
        34,
        9,
        110,
        83,
        71,
        60
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateListing",
      "discriminator": [
        192,
        174,
        210,
        68,
        116,
        40,
        242,
        253
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "listing"
          ]
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "category",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "promptListing",
      "discriminator": [
        128,
        204,
        56,
        75,
        11,
        223,
        214,
        103
      ]
    }
  ],
  "types": [
    {
      "name": "promptListing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "category",
            "type": "string"
          },
          {
            "name": "fileHash",
            "type": "string"
          },
          {
            "name": "sales",
            "type": "u64"
          },
          {
            "name": "revenue",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
