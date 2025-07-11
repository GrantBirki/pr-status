"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringToArray = stringToArray;
const core = __importStar(require("@actions/core"));
function stringToArray(string) {
    try {
        if (string === null || string === undefined || typeof string !== 'string') {
            core.debug('in stringToArray(), invalid input was found so an empty Array was returned');
            return [];
        }
        if (string.trim() === '') {
            core.debug('in stringToArray(), an empty String was found so an empty Array was returned');
            return [];
        }
        const stringArray = string.split(',').map(target => target.trim());
        const results = [];
        for (const item of stringArray) {
            if (item === '') {
                continue;
            }
            results.push(item);
        }
        return results;
    }
    catch (error) {
        core.error(`failed string for debugging purposes: ${string}`);
        throw new Error(`could not convert String to Array - error: ${error}`);
    }
}
