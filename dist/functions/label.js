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
exports.label = label;
const core = __importStar(require("@actions/core"));
async function label(issueNumber, context, octokit, labelsToAdd, labelsToRemove) {
    const { owner, repo } = context.repo;
    let addedLabels = [];
    const removedLabels = [];
    if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
        core.info('🏷️ no labels to add or remove');
        return {
            added: [],
            removed: []
        };
    }
    if (labelsToRemove.length > 0) {
        core.debug('fetching current labels on the issue');
        const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
            owner: owner,
            repo: repo,
            issue_number: issueNumber
        });
        const currentLabels = currentLabelsResult.data.map(label => label.name);
        core.info(`current labels: ${currentLabels}`);
        core.info(`labels to remove: ${labelsToRemove}`);
        for (const label of labelsToRemove) {
            if (currentLabels.includes(label)) {
                await octokit.rest.issues.removeLabel({
                    owner: owner,
                    repo: repo,
                    issue_number: issueNumber,
                    name: label
                });
                core.info(`🏷️ label removed: ${label}`);
                removedLabels.push(label);
            }
            else {
                core.info(`🏷️ label not found: '${label}' so it was not removed`);
            }
        }
    }
    if (labelsToAdd.length > 0) {
        core.debug(`attempting to apply labels: ${labelsToAdd}`);
        await octokit.rest.issues.addLabels({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            labels: labelsToAdd
        });
        core.info(`🏷️ labels added: ${labelsToAdd}`);
        addedLabels = labelsToAdd;
    }
    return {
        added: addedLabels,
        removed: removedLabels
    };
}
