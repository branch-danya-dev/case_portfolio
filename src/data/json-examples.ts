/**
 * Примеры для инструмента JSON / YAML: JSON Schema кадрового события, собранная из AsyncAPI кейса
 * (04_integrations/api/hr-events.asyncapi.yaml, components.schemas; ссылки переведены в #/$defs/),
 * и примеры сообщений из того же контракта. Сгенерировано один раз; при изменении контракта обновите вручную.
 */
export const EMPLOYEE_EVENT_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EmployeeEvent — кадровое событие (кейс IDM-JOINER)",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "eventId",
    "eventType",
    "occurredAt",
    "schemaVersion",
    "personId",
    "employment"
  ],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid",
      "description": "Уникальный идентификатор события; ключ идемпотентности для получателей"
    },
    "eventType": {
      "type": "string",
      "enum": [
        "HIRE",
        "HIRE_CHANGED",
        "HIRE_CANCELLED"
      ],
      "description": "HIRE — проведён приказ о приёме;\nHIRE_CHANGED — изменены данные приказа до даты выхода (дата, должность, подразделение);\nHIRE_CANCELLED — приказ о приёме отменён.\n"
    },
    "occurredAt": {
      "type": "string",
      "format": "date-time",
      "description": "Момент проведения операции в HRMS"
    },
    "schemaVersion": {
      "type": "integer",
      "const": 1,
      "description": "Версия схемы. Несовместимые изменения — новый топик (.v2)"
    },
    "personId": {
      "type": "string",
      "pattern": "^P-[0-9]{1,10}$",
      "description": "Идентификатор физического лица в HRMS, не меняется при повторном приёме"
    },
    "person": {
      "$ref": "#/$defs/Person"
    },
    "employment": {
      "$ref": "#/$defs/Employment"
    }
  },
  "if": {
    "properties": {
      "eventType": {
        "enum": [
          "HIRE",
          "HIRE_CHANGED"
        ]
      }
    }
  },
  "then": {
    "required": [
      "person"
    ],
    "properties": {
      "employment": {
        "required": [
          "hrEmploymentId",
          "employeeNumber",
          "employmentType",
          "hireDate",
          "orgUnit",
          "position"
        ]
      }
    }
  },
  "$defs": {
    "Person": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "lastName",
        "firstName"
      ],
      "properties": {
        "lastName": {
          "type": "string",
          "maxLength": 60
        },
        "firstName": {
          "type": "string",
          "maxLength": 60
        },
        "middleName": {
          "type": "string",
          "maxLength": 60
        },
        "mobilePhone": {
          "type": "string",
          "pattern": "^\\+7[0-9]{10}$",
          "description": "Мобильный телефон для SMS с одноразовым паролем (E.164)"
        }
      }
    },
    "Employment": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "hrEmploymentId"
      ],
      "properties": {
        "hrEmploymentId": {
          "type": "string",
          "description": "Идентификатор трудоустройства (договора) в HRMS"
        },
        "employeeNumber": {
          "type": "string",
          "description": "Табельный номер"
        },
        "employmentType": {
          "type": "string",
          "enum": [
            "MAIN",
            "PART_TIME"
          ],
          "description": "MAIN — основное место работы, PART_TIME — совместительство"
        },
        "hireDate": {
          "type": "string",
          "format": "date",
          "description": "Первый рабочий день"
        },
        "orgUnit": {
          "type": "object",
          "required": [
            "code",
            "name",
            "type"
          ],
          "properties": {
            "code": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "type": {
              "type": "string",
              "enum": [
                "RETAIL_OFFICE",
                "CREDIT_DEPT",
                "ACCOUNTING",
                "IT_DEPT",
                "OTHER"
              ]
            }
          }
        },
        "position": {
          "type": "object",
          "required": [
            "code",
            "name"
          ],
          "properties": {
            "code": {
              "type": "string"
            },
            "name": {
              "type": "string"
            }
          }
        },
        "managerEmployeeNumber": {
          "type": "string",
          "description": "Табельный номер руководителя; может отсутствовать"
        }
      }
    }
  }
} as const;

export const EMPLOYEE_EVENT_EXAMPLES: { name: string; summary: string; payload: unknown }[] = [
  {
    "name": "hire",
    "summary": "Приём операциониста в офис Екатеринбурга",
    "payload": {
      "eventId": "3f6c2a5e-8b1d-4c1e-9a77-0c2b9d1e4f10",
      "eventType": "HIRE",
      "occurredAt": "2027-03-01T10:15:00+03:00",
      "schemaVersion": 1,
      "personId": "P-100500",
      "person": {
        "lastName": "Иванов",
        "firstName": "Алексей",
        "middleName": "Петрович",
        "mobilePhone": "+79001234567"
      },
      "employment": {
        "hrEmploymentId": "E-2027-00431",
        "employeeNumber": "004318",
        "employmentType": "MAIN",
        "hireDate": "2027-03-15",
        "orgUnit": {
          "code": "1601",
          "name": "Доп. офис «Екатеринбург-Центр»",
          "type": "RETAIL_OFFICE"
        },
        "position": {
          "code": "40110",
          "name": "Операционист"
        },
        "managerEmployeeNumber": "001207"
      }
    }
  },
  {
    "name": "cancelled",
    "summary": "Отмена приёма",
    "payload": {
      "eventId": "9a1e7c3b-2d44-4f0a-8e61-5b3c7d2a9e01",
      "eventType": "HIRE_CANCELLED",
      "occurredAt": "2027-03-11T16:40:00+03:00",
      "schemaVersion": 1,
      "personId": "P-100500",
      "employment": {
        "hrEmploymentId": "E-2027-00431"
      }
    }
  }
];

/** Событие с ошибками: неизвестный eventType, personId без префикса, лишнее поле, нет person. */
export const EMPLOYEE_EVENT_BAD = {
  "eventId": "3f6c2a5e-8b1d-4c1e-9a77-0c2b9d1e4f10",
  "eventType": "HIRE_TRANSFER",
  "occurredAt": "2027-03-01T10:15:00+03:00",
  "schemaVersion": 1,
  "personId": "100500",
  "employment": {
    "hrEmploymentId": "E-2027-00431",
    "employeeNumber": "004318",
    "employmentType": "MAIN",
    "hireDate": "2027-03-15",
    "orgUnit": {
      "code": "1601",
      "name": "Доп. офис «Екатеринбург-Центр»",
      "type": "RETAIL_OFFICE"
    },
    "position": {
      "code": "40110",
      "name": "Операционист"
    },
    "managerEmployeeNumber": "001207"
  },
  "extra": 1
};
