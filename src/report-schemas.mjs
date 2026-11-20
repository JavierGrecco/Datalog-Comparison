// Runtime copies of the published JSON Schema documents.
// Keep the corresponding files under /schemas as the portable, canonical contracts.
export const IMPORTED_COMPARISON_REPORT_SCHEMA_DOCUMENT = Object.freeze({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:datalog-comparison:imported-run-comparison:1",
  "title": "Datalog Comparison · Imported run comparison report",
  "description": "Portable, versioned summary of two independently imported ECU/logger or dynamometer CSV runs. It contains no raw samples or CSV rows.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema",
    "exportedAt",
    "status",
    "headline",
    "method",
    "minimumCoveragePct",
    "reference",
    "candidate",
    "timeAlignment",
    "channels",
    "excludedChannels",
    "blockedReasons",
    "readiness",
    "warnings",
    "nextActions",
    "policy",
    "limitations"
  ],
  "properties": {
    "schema": {
      "const": "datalog-imported-run-comparison/1"
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time"
    },
    "status": {
      "enum": [
        "blocked",
        "review_required",
        "descriptive_only"
      ]
    },
    "headline": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "method": {
      "const": "unpaired-distribution-summary/1"
    },
    "minimumCoveragePct": {
      "type": "number",
      "minimum": 0,
      "maximum": 100
    },
    "reference": {
      "allOf": [
        {
          "$ref": "#/$defs/run"
        },
        {
          "properties": {
            "role": {
              "const": "reference"
            }
          },
          "required": [
            "role"
          ]
        }
      ]
    },
    "candidate": {
      "allOf": [
        {
          "$ref": "#/$defs/run"
        },
        {
          "properties": {
            "role": {
              "const": "candidate"
            }
          },
          "required": [
            "role"
          ]
        }
      ]
    },
    "timeAlignment": {
      "$ref": "#/$defs/timeAlignment"
    },
    "channels": {
      "type": "array",
      "maxItems": 256,
      "items": {
        "$ref": "#/$defs/channel"
      }
    },
    "excludedChannels": {
      "type": "array",
      "maxItems": 256,
      "items": {
        "$ref": "#/$defs/excludedChannel"
      }
    },
    "blockedReasons": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "string",
        "maxLength": 1200
      }
    },
    "readiness": {
      "$ref": "#/$defs/readiness"
    },
    "warnings": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "string",
        "maxLength": 1200
      }
    },
    "nextActions": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "string",
        "maxLength": 1200
      }
    },
    "policy": {
      "$ref": "#/$defs/policy"
    },
    "limitations": {
      "type": "array",
      "minItems": 5,
      "maxItems": 10,
      "items": {
        "type": "string",
        "maxLength": 1200
      }
    }
  },
  "$defs": {
    "run": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "role",
        "id",
        "name",
        "domain",
        "sourceType",
        "sampleCount",
        "sha256",
        "measurementBasis",
        "measurementBasisLabel",
        "units",
        "import"
      ],
      "properties": {
        "role": {
          "enum": [
            "reference",
            "candidate"
          ]
        },
        "id": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 128
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 180
        },
        "domain": {
          "enum": [
            "ecu",
            "dyno",
            "unknown"
          ]
        },
        "sourceType": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 160
        },
        "sampleCount": {
          "type": "integer",
          "minimum": 0
        },
        "sha256": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$"
            }
          ]
        },
        "measurementBasis": {
          "enum": [
            "wheel",
            "roller",
            "hub",
            "engine",
            "unknown",
            null
          ]
        },
        "measurementBasisLabel": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 32
        },
        "units": {
          "type": "object",
          "propertyNames": {
            "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"
          },
          "additionalProperties": {
            "type": "string",
            "minLength": 1,
            "maxLength": 48
          }
        },
        "import": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "$ref": "#/$defs/importMetadata"
            }
          ]
        }
      }
    },
    "importMetadata": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "parserId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "importFormat": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "sourceEncoding": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "unitNormalizationVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "sourceRowCount": {
          "type": "integer",
          "minimum": 0
        },
        "skippedNonEmptyRowCount": {
          "type": "integer",
          "minimum": 0
        },
        "skippedEmptyRowCount": {
          "type": "integer",
          "minimum": 0
        },
        "parsedSampleCount": {
          "type": "integer",
          "minimum": 0
        },
        "headerRows": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "type": "integer",
            "minimum": 0
          }
        },
        "channelMapping": {
          "type": "array",
          "maxItems": 128,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "channel"
            ],
            "properties": {
              "channel": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"
              },
              "sourceHeader": {
                "type": "string",
                "maxLength": 180
              },
              "sourceUnit": {
                "type": "string",
                "maxLength": 48
              },
              "canonicalUnit": {
                "type": "string",
                "maxLength": 48
              }
            }
          }
        },
        "unitConversions": {
          "type": "object",
          "propertyNames": {
            "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"
          },
          "additionalProperties": {
            "$ref": "#/$defs/unitConversion"
          }
        },
        "unmappedHeaderCount": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "unitConversion": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to",
        "factor",
        "offset"
      ],
      "properties": {
        "from": {
          "type": "string",
          "minLength": 1,
          "maxLength": 48
        },
        "to": {
          "type": "string",
          "minLength": 1,
          "maxLength": 48
        },
        "factor": {
          "type": [
            "number",
            "null"
          ]
        },
        "offset": {
          "type": [
            "number",
            "null"
          ]
        }
      }
    },
    "statistics": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "sampleCount",
        "validCount",
        "coveragePct",
        "min",
        "max",
        "mean",
        "median"
      ],
      "properties": {
        "sampleCount": {
          "type": "integer",
          "minimum": 0
        },
        "validCount": {
          "type": "integer",
          "minimum": 0
        },
        "coveragePct": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        "min": {
          "type": "number"
        },
        "max": {
          "type": "number"
        },
        "mean": {
          "type": "number"
        },
        "median": {
          "type": "number"
        }
      }
    },
    "difference": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "median",
        "mean",
        "medianPct",
        "min",
        "max"
      ],
      "properties": {
        "median": {
          "type": [
            "number",
            "null"
          ]
        },
        "mean": {
          "type": [
            "number",
            "null"
          ]
        },
        "medianPct": {
          "type": [
            "number",
            "null"
          ]
        },
        "min": {
          "type": [
            "number",
            "null"
          ]
        },
        "max": {
          "type": [
            "number",
            "null"
          ]
        }
      }
    },
    "channel": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "key",
        "unit",
        "reference",
        "candidate",
        "difference"
      ],
      "properties": {
        "key": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"
        },
        "unit": {
          "type": [
            "string",
            "null"
          ]
        },
        "reference": {
          "$ref": "#/$defs/statistics"
        },
        "candidate": {
          "$ref": "#/$defs/statistics"
        },
        "difference": {
          "$ref": "#/$defs/difference"
        }
      }
    },
    "excludedChannel": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "key",
        "reasonCode",
        "reason",
        "referenceUnit",
        "candidateUnit",
        "referenceMeasurementBasis",
        "candidateMeasurementBasis",
        "referenceCount",
        "candidateCount",
        "referenceCoveragePct",
        "candidateCoveragePct"
      ],
      "properties": {
        "key": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$"
        },
        "reasonCode": {
          "type": [
            "string",
            "null"
          ]
        },
        "reason": {
          "type": [
            "string",
            "null"
          ]
        },
        "referenceUnit": {
          "type": [
            "string",
            "null"
          ]
        },
        "candidateUnit": {
          "type": [
            "string",
            "null"
          ]
        },
        "referenceMeasurementBasis": {
          "enum": [
            "wheel",
            "roller",
            "hub",
            "engine",
            "unknown",
            null
          ]
        },
        "candidateMeasurementBasis": {
          "enum": [
            "wheel",
            "roller",
            "hub",
            "engine",
            "unknown",
            null
          ]
        },
        "referenceCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "candidateCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "referenceCoveragePct": {
          "type": [
            "number",
            "null"
          ]
        },
        "candidateCoveragePct": {
          "type": [
            "number",
            "null"
          ]
        }
      }
    },
    "gate": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "label",
        "status",
        "summary",
        "findings"
      ],
      "properties": {
        "id": {
          "type": [
            "string",
            "null"
          ]
        },
        "label": {
          "type": [
            "string",
            "null"
          ]
        },
        "status": {
          "type": [
            "string",
            "null"
          ]
        },
        "summary": {
          "type": [
            "string",
            "null"
          ]
        },
        "findings": {
          "type": "array",
          "maxItems": 40,
          "items": {
            "type": "string",
            "maxLength": 1200
          }
        }
      }
    },
    "readiness": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "status",
        "headline",
        "gates"
      ],
      "properties": {
        "status": {
          "type": [
            "string",
            "null"
          ]
        },
        "headline": {
          "type": [
            "string",
            "null"
          ]
        },
        "gates": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "$ref": "#/$defs/gate"
          }
        }
      }
    },
    "timeAlignment": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "performed",
        "reason"
      ],
      "properties": {
        "performed": {
          "const": false
        },
        "reason": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "causalInferenceAllowed",
        "sourceDataModified"
      ],
      "properties": {
        "causalInferenceAllowed": {
          "const": false
        },
        "sourceDataModified": {
          "const": false
        }
      }
    }
  }
});
export const LOCAL_DOSSIER_BACKUP_SCHEMA_DOCUMENT = Object.freeze({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:datalog-comparison:local-dossier-backup:1",
  "title": "Datalog Comparison · Local dossier backup",
  "description": "Portable backup of one local dossier. Source CSV bytes are intentionally excluded.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema",
    "createdAt",
    "dossier",
    "reports",
    "derivedArtifacts",
    "sourceArchives",
    "limitations"
  ],
  "properties": {
    "schema": {
      "const": "datalog-local-dossier-backup/1"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "dossier": {
      "$ref": "#/$defs/dossier"
    },
    "reports": {
      "type": "array",
      "maxItems": 250,
      "items": {
        "$ref": "#/$defs/storedReport"
      }
    },
    "derivedArtifacts": {
      "type": "array",
      "maxItems": 1000,
      "items": {
        "$ref": "#/$defs/derivedArtifact"
      }
    },
    "sourceArchives": {
      "$ref": "#/$defs/sourceArchives"
    },
    "limitations": {
      "type": "array",
      "minItems": 3,
      "maxItems": 10,
      "items": {
        "type": "string",
        "maxLength": 1200
      }
    }
  },
  "$defs": {
    "dossier": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "vehicleLabel",
        "notes",
        "createdAt",
        "updatedAt"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "vehicleLabel": {
          "type": "string",
          "maxLength": 180
        },
        "notes": {
          "type": "string",
          "maxLength": 2000
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "sourceReference": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "role",
        "name",
        "domain",
        "sampleCount",
        "sha256"
      ],
      "properties": {
        "role": {
          "enum": [
            "reference",
            "candidate"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 180
        },
        "domain": {
          "enum": [
            "ecu",
            "dyno",
            "unknown"
          ]
        },
        "sampleCount": {
          "type": "integer",
          "minimum": 0
        },
        "sha256": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$"
            }
          ]
        }
      }
    },
    "storedReport": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "fileName",
        "reportSchema",
        "storedAt",
        "sourceReferences",
        "report"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "fileName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 180
        },
        "reportSchema": {
          "const": "datalog-imported-run-comparison/1"
        },
        "storedAt": {
          "type": "string",
          "format": "date-time"
        },
        "sourceReferences": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {
            "$ref": "#/$defs/sourceReference"
          }
        },
        "report": {
          "type": "object",
          "required": [
            "schema"
          ],
          "properties": {
            "schema": {
              "const": "datalog-imported-run-comparison/1"
            }
          },
          "additionalProperties": true
        }
      }
    },
    "derivedArtifact": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "reportId",
        "kind",
        "algorithm",
        "algorithmVersion",
        "source",
        "metadata",
        "payload",
        "createdAt"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "reportId": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 80
        },
        "kind": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "algorithm": {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        "algorithmVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "source": {
          "type": "object",
          "additionalProperties": true
        },
        "metadata": {
          "type": "object",
          "additionalProperties": true
        },
        "payload": {
          "type": "object",
          "additionalProperties": true
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "sourceArchiveReference": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "role",
        "reportId",
        "name",
        "size",
        "mimeType",
        "sha256",
        "storedAt",
        "contentIncluded"
      ],
      "properties": {
        "role": {
          "enum": [
            "reference",
            "candidate"
          ]
        },
        "reportId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 180
        },
        "size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 104857600
        },
        "mimeType": {
          "type": "string",
          "maxLength": 120
        },
        "sha256": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        "storedAt": {
          "type": "string",
          "format": "date-time"
        },
        "contentIncluded": {
          "const": false
        }
      }
    },
    "sourceArchives": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "contentIncluded",
        "archivedFileCount",
        "references"
      ],
      "properties": {
        "contentIncluded": {
          "const": false
        },
        "archivedFileCount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 500
        },
        "references": {
          "type": "array",
          "maxItems": 500,
          "items": {
            "$ref": "#/$defs/sourceArchiveReference"
          }
        }
      }
    }
  }
});
