const User = require('../models/User');
const {
  buildPublicPrivacySettings,
  normalizePrivacyValue
} = require('../utils/privacy');

const PRIVACY_BOOLEAN_FIELDS = [
  'searchEngineVisibility',
  'activityStatus',
  'allowConnectionRequests',
  'dataSharing',
  'invitationsFromNetwork',
  'messagesYouReceive',
  'researchInvitations',
  'marketingEmails',
  'focusedInbox',
  'deliveryIndicators',
  'messagingSuggestions',
  'messageNudges',
  'harmfulMessageDetection'
];

const DEMOGRAPHIC_GENDER_VALUES = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'];
const DEMOGRAPHIC_DISABILITY_VALUES = ['Yes', 'No', 'Prefer not to say'];

const DEFAULT_DEMOGRAPHIC = Object.freeze({
  gender: 'Prefer not to say',
  disability: 'Prefer not to say'
});

const DEFAULT_VERIFICATIONS = Object.freeze({
  identity: {
    type: 'Identity',
    enabled: false,
    verifiedBy: '',
    details: '',
    verificationDate: ''
  },
  workplace: {
    type: 'Workplace',
    enabled: false,
    organization: '',
    method: '',
    email: '',
    verificationDate: '',
    saveEmail: false
  }
});

const cloneDefaults = (value) => JSON.parse(JSON.stringify(value));

const normalizeText = (value, fallback = '', maxLength = 200) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
};

const normalizeDemographic = (input = {}) => {
  const genderCandidate = normalizeText(input.gender, DEFAULT_DEMOGRAPHIC.gender, 40);
  const disabilityCandidate = normalizeText(input.disability, DEFAULT_DEMOGRAPHIC.disability, 40);

  return {
    gender: DEMOGRAPHIC_GENDER_VALUES.includes(genderCandidate)
      ? genderCandidate
      : DEFAULT_DEMOGRAPHIC.gender,
    disability: DEMOGRAPHIC_DISABILITY_VALUES.includes(disabilityCandidate)
      ? disabilityCandidate
      : DEFAULT_DEMOGRAPHIC.disability
  };
};

const normalizeVerifications = (input = {}) => {
  const defaults = cloneDefaults(DEFAULT_VERIFICATIONS);
  const identityInput = typeof input.identity === 'object' && input.identity ? input.identity : {};
  const workplaceInput = typeof input.workplace === 'object' && input.workplace ? input.workplace : {};

  return {
    identity: {
      type: normalizeText(identityInput.type, defaults.identity.type, 60),
      enabled: typeof identityInput.enabled === 'boolean' ? identityInput.enabled : defaults.identity.enabled,
      verifiedBy: normalizeText(identityInput.verifiedBy, defaults.identity.verifiedBy, 120),
      details: normalizeText(identityInput.details, defaults.identity.details, 240),
      verificationDate: normalizeText(identityInput.verificationDate, defaults.identity.verificationDate, 40)
    },
    workplace: {
      type: normalizeText(workplaceInput.type, defaults.workplace.type, 60),
      enabled: typeof workplaceInput.enabled === 'boolean' ? workplaceInput.enabled : defaults.workplace.enabled,
      organization: normalizeText(workplaceInput.organization, defaults.workplace.organization, 140),
      method: normalizeText(workplaceInput.method, defaults.workplace.method, 140),
      email: normalizeText(workplaceInput.email, defaults.workplace.email, 140),
      verificationDate: normalizeText(workplaceInput.verificationDate, defaults.workplace.verificationDate, 40),
      saveEmail: typeof workplaceInput.saveEmail === 'boolean'
        ? workplaceInput.saveEmail
        : defaults.workplace.saveEmail
    }
  };
};

const normalizePrivacyUpdates = (payload = {}) => {
  const updates = { privacySettings: {} };

  const profileVisibilityInput = payload.profileVisibility || payload.profile;
  if (typeof profileVisibilityInput === 'string') {
    updates.profileVisibility = normalizePrivacyValue(profileVisibilityInput, 'public');
  }

  const postVisibilityInput = payload.postVisibility || payload.posts;
  if (typeof postVisibilityInput === 'string') {
    updates.postVisibility = normalizePrivacyValue(postVisibilityInput, 'public');
  }

  if (typeof payload.messagePrivacy === 'string') {
    updates.messagePrivacy = normalizePrivacyValue(payload.messagePrivacy, 'friends');
  } else if (typeof payload.allowMessages === 'boolean') {
    updates.messagePrivacy = payload.allowMessages ? 'friends' : 'private';
  }

  if (typeof payload.allowTagging === 'string' && ['everyone', 'friends', 'no one'].includes(payload.allowTagging)) {
    updates.privacySettings.allowTagging = payload.allowTagging;
  }

  PRIVACY_BOOLEAN_FIELDS.forEach((field) => {
    if (typeof payload[field] === 'boolean') {
      updates.privacySettings[field] = payload[field];
    }
  });

  if (payload.clearDemographic === true) {
    updates.privacySettings.demographic = { ...DEFAULT_DEMOGRAPHIC };
  }

  if (typeof payload.demographic === 'object' && payload.demographic) {
    updates.privacySettings.demographic = normalizeDemographic(payload.demographic);
  }

  if (payload.clearVerifications === true) {
    updates.privacySettings.verifications = cloneDefaults(DEFAULT_VERIFICATIONS);
  }

  if (typeof payload.verifications === 'object' && payload.verifications) {
    updates.privacySettings.verifications = normalizeVerifications(payload.verifications);
  }

  if (Object.keys(updates.privacySettings).length === 0) {
    delete updates.privacySettings;
  }

  return updates;
};

const buildPrivacyResponse = (user) => {
  const normalized = buildPublicPrivacySettings(user);
  const settings = user.privacySettings?.toObject
    ? user.privacySettings.toObject()
    : (user.privacySettings || {});

  return {
    ...normalized,
    profileVisibility: normalized.profile,
    postVisibility: normalized.posts,
    invitationsFromNetwork: settings.invitationsFromNetwork !== false,
    messagesYouReceive: settings.messagesYouReceive !== false,
    researchInvitations: settings.researchInvitations === true,
    marketingEmails: settings.marketingEmails === true,
    focusedInbox: settings.focusedInbox === true,
    deliveryIndicators: settings.deliveryIndicators !== false,
    messagingSuggestions: settings.messagingSuggestions !== false,
    messageNudges: settings.messageNudges === true,
    harmfulMessageDetection: settings.harmfulMessageDetection !== false,
    demographic: normalizeDemographic(settings.demographic || {}),
    verifications: normalizeVerifications(settings.verifications || {})
  };
};

exports.updatePrivacy = async (req, res) => {
  try {
    const updates = normalizePrivacyUpdates(req.body || {});
    const user = await User.findById(req.user._id).select(
      'profileVisibility postVisibility messagePrivacy privacySettings'
    );
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (updates.profileVisibility) {
      user.profileVisibility = updates.profileVisibility;
    }
    if (updates.postVisibility) {
      user.postVisibility = updates.postVisibility;
    }
    if (updates.messagePrivacy) {
      user.messagePrivacy = updates.messagePrivacy;
    }

    if (updates.privacySettings) {
      const currentSettings = user.privacySettings?.toObject
        ? user.privacySettings.toObject()
        : (user.privacySettings || {});
      user.privacySettings = {
        ...currentSettings,
        ...updates.privacySettings
      };
    }

    await user.save();

    res.json(buildPrivacyResponse(user));
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getPrivacy = async (req, res) => {
  const fallbackUser = req.user;
  if (!fallbackUser) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  return res.json(buildPrivacyResponse(fallbackUser));
};
