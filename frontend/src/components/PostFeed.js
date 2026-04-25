import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FiThumbsUp, FiMessageCircle, FiShare2, FiEdit2, FiTrash2 } from 'react-icons/fi';
import {
  encryptMessageForUsers,
  ensureE2EEIdentity,
  getRecipientPublicKey
} from '../utils/e2ee';
import { resolveImageUrl } from '../utils/imageUrl';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const resolveAssetUrl = (url, authToken = '') => {
  if (!url) return '';
  if (url.startsWith('http')) return url;

  const normalized = `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  const isProtectedPostMedia = /\/api\/posts\/[^/]+\/media$/i.test(normalized);
  if (!isProtectedPostMedia || !authToken) {
    return normalized;
  }

  const separator = normalized.includes('?') ? '&' : '?';
  return `${normalized}${separator}token=${encodeURIComponent(authToken)}`;
};

const formatPostTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const resolveDownloadName = (contentDisposition = '', fallbackName = 'attachment') => {
  if (!contentDisposition) return fallbackName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallbackName;
};

const SHARE_RECENT_STORAGE_KEY = 'trustnode.shareRecentRecipients';
const SHARE_RECENT_LIMIT = 8;
const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const normalizeShareRecipient = (candidate = {}) => {
  const recipientId = candidate._id ? String(candidate._id) : '';
  if (!recipientId) {
    return null;
  }

  const profile = candidate.profile || {};
  const username = String(candidate.username || candidate.name || 'User').trim() || 'User';
  const avatar = candidate.avatar || profile.avatar || '';
  const jobTitle = candidate.jobTitle || profile.jobTitle || '';
  const location = candidate.location || profile.location || '';
  const allowsMessages = candidate.allowsMessages !== false && candidate.privacy?.allowMessages !== false;

  return {
    _id: recipientId,
    username,
    avatar,
    jobTitle,
    location,
    allowsMessages
  };
};

const dedupeShareRecipients = (recipients = []) => {
  const seen = new Set();
  const uniqueRecipients = [];

  recipients.forEach((recipient) => {
    const normalizedRecipient = normalizeShareRecipient(recipient);
    if (!normalizedRecipient || seen.has(normalizedRecipient._id)) {
      return;
    }
    seen.add(normalizedRecipient._id);
    uniqueRecipients.push(normalizedRecipient);
  });

  return uniqueRecipients;
};

const matchesShareRecipient = (recipient, rawQuery) => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [recipient.username, recipient.jobTitle, recipient.location]
    .map((field) => String(field || '').toLowerCase())
    .some((field) => field.includes(query));
};

const readRecentShareRecipients = () => {
  if (typeof window === 'undefined') return [];

  try {
    const rawValue = window.localStorage.getItem(SHARE_RECENT_STORAGE_KEY);
    if (!rawValue) return [];
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];
    return dedupeShareRecipients(parsedValue).slice(0, SHARE_RECENT_LIMIT);
  } catch (error) {
    return [];
  }
};

const AvatarWithFallback = ({
  src = '',
  alt = 'avatar',
  initial = 'U',
  imageClassName = '',
  fallbackClassName = '',
  fallbackStyle = {}
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const safeInitial = (String(initial || 'U').trim().charAt(0).toUpperCase() || 'U');

  if (!src || imageFailed) {
    return (
      <div className={fallbackClassName} style={fallbackStyle} role="img" aria-label={alt}>
        {safeInitial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={imageClassName}
      onError={() => setImageFailed(true)}
    />
  );
};

const PostFeed = ({
  profile,
  onPostCreated = () => {},
  onPostDeleted = () => {},
  onViewProfile = () => {},
  feedMode = 'all'
}) => {
  const [dynamicPosts, setDynamicPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [likingPostId, setLikingPostId] = useState('');
  const [sharingPostId, setSharingPostId] = useState('');
  const [commentingPostId, setCommentingPostId] = useState('');
  const [status, setStatus] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTargetPost, setShareTargetPost] = useState(null);
  const [connections, setConnections] = useState([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [hasLoadedShareConnections, setHasLoadedShareConnections] = useState(false);
  const [sendingShare, setSendingShare] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
  const [downloadingAttachmentPostId, setDownloadingAttachmentPostId] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState([]);
  const [shareSearchStatus, setShareSearchStatus] = useState('');
  const [searchingShareUsers, setSearchingShareUsers] = useState(false);
  const [recentShareRecipients, setRecentShareRecipients] = useState(() => readRecentShareRecipients());
  const [composerAvatarFailed, setComposerAvatarFailed] = useState(false);
  const [editingPostId, setEditingPostId] = useState('');
  const [editingPostContent, setEditingPostContent] = useState('');
  const [savingEditPostId, setSavingEditPostId] = useState('');
  const [deletingPostId, setDeletingPostId] = useState('');

  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [openComments, setOpenComments] = useState({});

  const mediaInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const composerInputRef = useRef(null);

  const token = localStorage.getItem('token');
  const currentUserId = profile?._id ? String(profile._id) : '';
  const showOnlyCurrentUserPosts = feedMode === 'profile';
  const rawAvatarPath = profile?.profile?.avatar || profile?.avatar || '';
  const avatarUrl = rawAvatarPath ? resolveImageUrl(rawAvatarPath) : '';
  const composerInitial = (
    String(profile?.username || profile?.name || profile?.profile?.fullName || 'U')
      .trim()
      .charAt(0)
      .toUpperCase()
    || 'U'
  );

  const mediaPreviewUrl = useMemo(() => {
    if (!mediaFile) return '';
    return URL.createObjectURL(mediaFile);
  }, [mediaFile]);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  useEffect(() => {
    setComposerAvatarFailed(false);
  }, [avatarUrl]);

  const fetchPosts = useCallback(async () => {
    if (!token) {
      setDynamicPosts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await axios.get('/api/posts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDynamicPosts(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.warn('Unable to fetch posts:', error.message);
      setDynamicPosts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const visiblePosts = useMemo(() => {
    if (!showOnlyCurrentUserPosts) {
      return dynamicPosts;
    }

    if (!currentUserId) {
      return [];
    }

    return dynamicPosts.filter((post) => String(post?.user?._id || '') === currentUserId);
  }, [currentUserId, dynamicPosts, showOnlyCurrentUserPosts]);

  const isOwnerPost = useCallback((post) => (
    Boolean(currentUserId) && String(post?.user?._id || '') === currentUserId
  ), [currentUserId]);

  const isPostEditable = useCallback((post) => {
    if (!isOwnerPost(post)) {
      return false;
    }
    const createdAtMs = new Date(post?.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) {
      return false;
    }
    return Date.now() - createdAtMs <= POST_EDIT_WINDOW_MS;
  }, [isOwnerPost]);

  const openPostAuthorProfile = useCallback((post) => {
    const userId = String(post?.user?._id || '');
    if (!userId) return;
    onViewProfile({
      _id: userId,
      id: userId,
      username: post?.user?.username || 'Unknown user',
      avatar: post?.user?.avatar || '',
      jobTitle: post?.user?.title || ''
    });
  }, [onViewProfile]);

  const fetchConnections = useCallback(async () => {
    if (!token) {
      setConnections([]);
      setHasLoadedShareConnections(false);
      return;
    }

    try {
      setLoadingConnections(true);
      setHasLoadedShareConnections(false);
      const res = await axios.get('/api/profile/connections', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const normalizedConnections = Array.isArray(res.data?.connections)
        ? dedupeShareRecipients(res.data.connections).filter((connection) => {
          const connectionId = String(connection?._id || '');
          const profileVisibility = String(connection?.privacy?.profile || '').toLowerCase();
          return connectionId && connectionId !== currentUserId && profileVisibility !== 'private';
        })
        : [];
      setConnections(normalizedConnections);
    } catch (error) {
      setConnections([]);
      const message = error.response?.data?.msg || 'Unable to load connections for sharing.';
      setStatus(message);
    } finally {
      setLoadingConnections(false);
      setHasLoadedShareConnections(true);
    }
  }, [currentUserId, token]);

  const connectionIdSet = useMemo(() => (
    new Set(
      (connections || [])
        .map((recipient) => String(recipient?._id || ''))
        .filter((recipientId) => recipientId && recipientId !== currentUserId)
    )
  ), [connections, currentUserId]);

  const uploadMedia = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await axios.post('/api/upload/post-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      }
    });

    return {
      mediaKey: res.data.mediaKey,
      mediaType: res.data.type
    };
  };

  const uploadAttachment = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await axios.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      }
    });

    return res.data.fileId;
  };

  const handlePublish = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && !mediaFile && !attachmentFile) {
      setStatus('Write something or attach media/file before posting.');
      return;
    }

    if (!token) {
      setStatus('Sign in to publish a post.');
      return;
    }

    try {
      setPosting(true);
      setStatus('Publishing post...');

      let mediaPayload = null;
      let attachmentId = null;

      if (mediaFile) {
        mediaPayload = await uploadMedia(mediaFile);
      }

      if (attachmentFile) {
        attachmentId = await uploadAttachment(attachmentFile);
      }

      const createdPost = await axios.post(
        '/api/posts',
        {
          content: trimmedContent,
          mediaKey: mediaPayload?.mediaKey,
          mediaType: mediaPayload?.mediaType,
          attachment: attachmentId
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setContent('');
      setMediaFile(null);
      setAttachmentFile(null);
      setStatus('Post published successfully.');
      onPostCreated(createdPost.data);

      await fetchPosts();
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to publish post.';
      setStatus(message);
    } finally {
      setPosting(false);
    }
  };

  const handleMediaPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedMediaTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/webm'];
    if (!allowedMediaTypes.includes(file.type)) {
      setStatus('Only JPG, PNG, MP4, and WEBM media are supported for post previews.');
      event.target.value = '';
      return;
    }

    setMediaFile(file);
    setStatus('');
  };

  const handleAttachmentPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedAttachmentTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedAttachmentTypes.includes(file.type)) {
      setStatus('Secure attachment supports JPG, PNG, or PDF.');
      event.target.value = '';
      return;
    }

    setAttachmentFile(file);
    setStatus('');
  };

  const removeSelectedMedia = () => {
    setMediaFile(null);
    if (mediaInputRef.current) {
      mediaInputRef.current.value = '';
    }
    setStatus('');
  };

  const removeSelectedAttachment = () => {
    setAttachmentFile(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
    setStatus('');
  };

  const handleAttachmentDownload = async (post) => {
    if (!post?.downloadUrl || !post?._id) {
      setStatus('Attachment is unavailable for this post.');
      return;
    }

    if (!token) {
      setStatus('Sign in to download attachments.');
      return;
    }

    try {
      setDownloadingAttachmentPostId(post._id);

      const res = await axios.get(post.downloadUrl, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` }
      });

      const fallbackName = post.attachmentName || `attachment-${post._id}`;
      const fileName = resolveDownloadName(res.headers?.['content-disposition'] || '', fallbackName);
      const blobUrl = window.URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setStatus(`Downloaded ${fileName}.`);
    } catch (error) {
      setStatus('Unable to download attachment right now.');
    } finally {
      setDownloadingAttachmentPostId('');
    }
  };

  const toggleCommentsPanel = (postId) => {
    setOpenComments((prev) => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const isPostLikedByCurrentUser = (post) => {
    if (!currentUserId || !Array.isArray(post.likes)) {
      return false;
    }

    return post.likes.some((likeEntry) => {
      if (!likeEntry) return false;
      if (typeof likeEntry === 'string') return likeEntry === currentUserId;
      if (typeof likeEntry === 'object' && likeEntry._id) return String(likeEntry._id) === currentUserId;
      return String(likeEntry) === currentUserId;
    });
  };

  const isPostSharedByCurrentUser = (post) => {
    if (!currentUserId || !Array.isArray(post.shares)) {
      return false;
    }

    return post.shares.some((shareEntry) => {
      if (!shareEntry) return false;
      if (typeof shareEntry === 'string') return shareEntry === currentUserId;
      if (typeof shareEntry === 'object' && shareEntry._id) return String(shareEntry._id) === currentUserId;
      return String(shareEntry) === currentUserId;
    });
  };

  const handleLike = async (post) => {
    if (!token) {
      setStatus('Sign in to like posts.');
      return;
    }

    try {
      setLikingPostId(post._id);
      const res = await axios.post(
        `/api/posts/${post._id}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedLikes = Array.isArray(res.data?.likes) ? res.data.likes : [];
      setDynamicPosts((prev) => prev.map((item) => (
        item._id === post._id
          ? { ...item, likes: updatedLikes }
          : item
      )));
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to update like.';
      setStatus(message);
    } finally {
      setLikingPostId('');
    }
  };

  const handleShare = async (post) => {
    if (!token) {
      setStatus('Sign in to share posts.');
      return;
    }

    setShareTargetPost(post);
    setShareSearch('');
    setShareSearchResults([]);
    setShareSearchStatus('');
    setSelectedConnectionIds([]);
    setShareModalOpen(true);
    await fetchConnections();
  };

  const persistRecentShareRecipients = useCallback((recipients) => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        SHARE_RECENT_STORAGE_KEY,
        JSON.stringify(recipients.slice(0, SHARE_RECENT_LIMIT))
      );
    } catch (error) {
      console.warn('Unable to persist share recipient recents:', error.message);
    }
  }, []);

  const addRecentShareRecipients = useCallback((recipients = []) => {
    const normalizedRecipients = dedupeShareRecipients(recipients).filter((recipient) => {
      const recipientId = String(recipient?._id || '');
      return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
    });
    if (!normalizedRecipients.length) return;

    setRecentShareRecipients((prev) => {
      const nextRecipients = dedupeShareRecipients([...normalizedRecipients, ...prev]).slice(0, SHARE_RECENT_LIMIT);
      persistRecentShareRecipients(nextRecipients);
      return nextRecipients;
    });
  }, [connectionIdSet, currentUserId, persistRecentShareRecipients]);

  useEffect(() => {
    if (!hasLoadedShareConnections) return;

    setRecentShareRecipients((prev) => {
      const filteredRecipients = dedupeShareRecipients(prev)
        .filter((recipient) => {
          const recipientId = String(recipient?._id || '');
          return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
        })
        .slice(0, SHARE_RECENT_LIMIT);

      const previousIds = dedupeShareRecipients(prev).map((recipient) => String(recipient._id)).join('|');
      const nextIds = filteredRecipients.map((recipient) => String(recipient._id)).join('|');
      if (previousIds === nextIds) {
        return prev;
      }

      persistRecentShareRecipients(filteredRecipients);
      return filteredRecipients;
    });
  }, [connectionIdSet, currentUserId, hasLoadedShareConnections, persistRecentShareRecipients]);

  const shareRecipientLookup = useMemo(() => {
    const entries = dedupeShareRecipients([
      ...connections,
      ...shareSearchResults,
      ...recentShareRecipients
    ]).filter((recipient) => {
      const recipientId = String(recipient?._id || '');
      return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
    });

    return entries.reduce((map, recipient) => {
      map.set(recipient._id, recipient);
      return map;
    }, new Map());
  }, [connectionIdSet, connections, currentUserId, shareSearchResults, recentShareRecipients]);

  const toggleConnectionSelection = (connectionOrId) => {
    const normalizedRecipient = typeof connectionOrId === 'string'
      ? shareRecipientLookup.get(String(connectionOrId))
      : normalizeShareRecipient(connectionOrId);
    const connectionId = normalizedRecipient?._id || String(connectionOrId || '').trim();
    if (!connectionId) return;
    if (!connectionIdSet.has(connectionId)) return;

    const wasSelected = selectedConnectionIds.includes(connectionId);
    setSelectedConnectionIds((prev) => (
      prev.includes(connectionId)
        ? prev.filter((id) => id !== connectionId)
        : [...prev, connectionId]
    ));

    if (!wasSelected) {
      addRecentShareRecipients([normalizedRecipient || { _id: connectionId }]);
      if (shareSearch.trim()) {
        setShareSearch('');
        setShareSearchStatus('');
        setShareSearchResults([]);
      }
    }
  };

  const closeShareModal = (force = false) => {
    if (sendingShare && !force) return;
    setShareModalOpen(false);
    setShareTargetPost(null);
    setSelectedConnectionIds([]);
    setShareSearch('');
    setShareSearchResults([]);
    setShareSearchStatus('');
    setSearchingShareUsers(false);
  };

  useEffect(() => {
    if (!shareModalOpen) return;
    const query = shareSearch.trim();

    if (!query) {
      setShareSearchResults([]);
      setShareSearchStatus('');
      setSearchingShareUsers(false);
      return;
    }
    if (!connectionIdSet.size) {
      setShareSearchResults([]);
      setShareSearchStatus('No matching connections found.');
      setSearchingShareUsers(false);
      return;
    }

    let cancelled = false;
    const searchDelay = setTimeout(async () => {
      if (!token) return;

      try {
        setSearchingShareUsers(true);
        setShareSearchStatus('Searching...');
        const res = await axios.get('/api/profile/search', {
          params: { q: query },
          headers: { Authorization: `Bearer ${token}` }
        });

        const results = Array.isArray(res.data?.results) ? res.data.results : [];
        const filteredResults = results.filter((candidate) => {
          const candidateId = String(candidate?._id || '');
          const profileVisibility = String(candidate?.privacy?.profile || '').toLowerCase();
          return (
            candidateId
            && candidateId !== currentUserId
            && Boolean(candidate?.isFriend)
            && connectionIdSet.has(candidateId)
            && profileVisibility !== 'private'
            && !candidate?.isPrivate
          );
        });
        const normalizedResults = dedupeShareRecipients(filteredResults).slice(0, 12);
        if (cancelled) return;

        setShareSearchResults(normalizedResults);
        setShareSearchStatus(normalizedResults.length ? '' : 'No matching connections found.');
      } catch (error) {
        if (cancelled) return;
        setShareSearchResults([]);
        setShareSearchStatus('Unable to load search results.');
      } finally {
        if (!cancelled) {
          setSearchingShareUsers(false);
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(searchDelay);
    };
  }, [connectionIdSet, currentUserId, shareModalOpen, shareSearch, token]);

  useEffect(() => {
    setSelectedConnectionIds((prev) => prev.filter((recipientId) => connectionIdSet.has(String(recipientId))));
  }, [connectionIdSet]);

  const shareToSelectedConnections = async () => {
    if (!token || !shareTargetPost) return;

    if (!selectedConnectionIds.length) {
      setStatus('Select at least one connection to share this post.');
      return;
    }

    try {
      setSendingShare(true);
      setSharingPostId(shareTargetPost._id);
      const res = await axios.post(
        `/api/posts/${shareTargetPost._id}/share`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedShares = Array.isArray(res.data?.shares) ? res.data.shares : [];
      setDynamicPosts((prev) => prev.map((item) => (
        item._id === shareTargetPost._id
          ? { ...item, shares: updatedShares }
          : item
      )));

      const shareUrl = `${window.location.origin}${window.location.pathname}#post-${shareTargetPost._id}`;
      const snippet = (shareTargetPost.content || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 110);
      const shareMessage = snippet
        ? `Shared a post with you: "${snippet}${shareTargetPost.content?.trim().length > 110 ? '...' : ''}"\n${shareUrl}`
        : `Shared a post with you:\n${shareUrl}`;

      const identity = await ensureE2EEIdentity({
        token,
        apiBase: API_BASE
      });

      const sendResults = await Promise.allSettled(
        selectedConnectionIds.map(async (recipientId) => {
          const recipientPublicKey = await getRecipientPublicKey({
            token,
            apiBase: API_BASE,
            recipientId
          });

          const encryptedPayload = await encryptMessageForUsers({
            message: shareMessage,
            recipientPublicKey,
            senderPublicKey: identity.publicKeyBase64
          });

          return axios.post(
            '/api/chat/send',
            {
              to: recipientId,
              encryptedMsg: encryptedPayload.encryptedMsg,
              encryptedAesKeyForRecipient: encryptedPayload.encryptedAesKeyForRecipient,
              encryptedAesKeyForSender: encryptedPayload.encryptedAesKeyForSender,
              iv: encryptedPayload.iv,
              e2eeVersion: encryptedPayload.e2eeVersion
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        })
      );

      const deliveredCount = sendResults.filter((result) => result.status === 'fulfilled').length;
      const deliveredRecipientIds = sendResults.reduce((acc, result, index) => {
        if (result.status === 'fulfilled') {
          acc.push(String(selectedConnectionIds[index]));
        }
        return acc;
      }, []);
      if (deliveredRecipientIds.length) {
        const deliveredRecipients = deliveredRecipientIds.map((recipientId) => (
          shareRecipientLookup.get(recipientId) || { _id: recipientId }
        ));
        addRecentShareRecipients(deliveredRecipients);
      }
      const failedCount = selectedConnectionIds.length - deliveredCount;

      if (deliveredCount > 0 && failedCount === 0) {
        setStatus(`Shared with ${deliveredCount} connection${deliveredCount > 1 ? 's' : ''}.`);
      } else if (deliveredCount > 0) {
        setStatus(`Shared with ${deliveredCount}. ${failedCount} failed (messages might be disabled).`);
      } else {
        setStatus('Could not share this post with selected connections.');
      }

      if (deliveredCount > 0) {
        closeShareModal(true);
      }
    } catch (error) {
      const message = error.response?.data?.msg || error.message || 'Unable to share post.';
      setStatus(message);
    } finally {
      setSharingPostId('');
      setSendingShare(false);
    }
  };

  const selectedRecipients = useMemo(() => (
    selectedConnectionIds
      .map((recipientId) => shareRecipientLookup.get(String(recipientId)))
      .filter(Boolean)
  ), [selectedConnectionIds, shareRecipientLookup]);

  const shareListSections = useMemo(() => {
    const safeConnections = dedupeShareRecipients(connections).filter((recipient) => {
      const recipientId = String(recipient?._id || '');
      return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
    });
    const safeRecents = dedupeShareRecipients(recentShareRecipients).filter((recipient) => {
      const recipientId = String(recipient?._id || '');
      return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
    });
    const safeSearchResults = dedupeShareRecipients(shareSearchResults).filter((recipient) => {
      const recipientId = String(recipient?._id || '');
      return recipientId && recipientId !== currentUserId && connectionIdSet.has(recipientId);
    });

    const query = shareSearch.trim();
    if (query) {
      const matchedConnections = safeConnections.filter((recipient) => matchesShareRecipient(recipient, query));
      const matchedSearchResults = safeSearchResults.filter((recipient) => matchesShareRecipient(recipient, query));
      const matchedRecent = safeRecents.filter((recipient) => matchesShareRecipient(recipient, query));

      const matchingPeople = dedupeShareRecipients([...matchedConnections, ...matchedSearchResults]);
      const matchingIds = new Set(matchingPeople.map((recipient) => recipient._id));
      const recentMatches = matchedRecent.filter((recipient) => !matchingIds.has(recipient._id));
      const sections = [];

      if (matchingPeople.length) {
        sections.push({
          key: 'matching-people',
          title: 'Matching people',
          items: matchingPeople
        });
      }

      if (recentMatches.length) {
        sections.push({
          key: 'recent-searches',
          title: 'Recent searches',
          items: recentMatches
        });
      }

      return sections;
    }

    const uniqueRecents = safeRecents;
    const recentIds = new Set(uniqueRecents.map((recipient) => recipient._id));
    const connectionList = safeConnections
      .filter((recipient) => !recentIds.has(recipient._id));
    const sections = [];

    if (uniqueRecents.length) {
      sections.push({
        key: 'recent-searches',
        title: 'Recent searches',
        items: uniqueRecents
      });
    }

    if (connectionList.length) {
      sections.push({
        key: 'connections',
        title: 'Connections',
        items: connectionList
      });
    }

    return sections;
  }, [connectionIdSet, connections, currentUserId, recentShareRecipients, shareSearch, shareSearchResults]);

  const handleCommentSubmit = async (event, post) => {
    event.preventDefault();
    const draft = (commentDrafts[post._id] || '').trim();

    if (!draft) {
      setStatus('Comment cannot be empty.');
      return;
    }

    if (!token) {
      setStatus('Sign in to comment on posts.');
      return;
    }

    try {
      setCommentingPostId(post._id);
      const res = await axios.post(
        `/api/posts/${post._id}/comments`,
        { text: draft },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const savedComment = res.data?.comment;
      if (savedComment) {
        setDynamicPosts((prev) => prev.map((item) => (
          item._id === post._id
            ? { ...item, comments: [...(item.comments || []), savedComment] }
            : item
        )));
      }

      setCommentDrafts((prev) => ({ ...prev, [post._id]: '' }));
      setOpenComments((prev) => ({ ...prev, [post._id]: true }));
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to add comment.';
      setStatus(message);
    } finally {
      setCommentingPostId('');
    }
  };

  const handleStartEditingPost = (post) => {
    if (!isOwnerPost(post)) return;
    if (!isPostEditable(post)) {
      setStatus('Post editing is allowed only within 24 hours of publishing.');
      return;
    }

    setEditingPostId(post._id);
    setEditingPostContent(String(post.content || ''));
    setStatus('');
  };

  const handleCancelEditingPost = () => {
    setEditingPostId('');
    setEditingPostContent('');
  };

  const handleSaveEditedPost = async (post) => {
    if (!token) {
      setStatus('Sign in to edit posts.');
      return;
    }

    const nextContent = editingPostContent.trim();
    if (!nextContent && !post.mediaUrl && !post.imageUrl && !post.hasAttachment) {
      setStatus('Post content cannot be empty unless media or attachment is present.');
      return;
    }

    try {
      setSavingEditPostId(post._id);
      const res = await axios.patch(
        `/api/posts/${post._id}`,
        { content: nextContent },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedPost = res.data?.post;
      if (updatedPost?._id) {
        setDynamicPosts((prev) => prev.map((item) => (
          item._id === updatedPost._id ? updatedPost : item
        )));
      }
      setStatus(res.data?.msg || 'Post updated successfully.');
      setEditingPostId('');
      setEditingPostContent('');
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to update post.';
      setStatus(message);
    } finally {
      setSavingEditPostId('');
    }
  };

  const handleDeletePost = async (post) => {
    if (!token) {
      setStatus('Sign in to delete posts.');
      return;
    }

    const shouldDelete = window.confirm('Delete this post permanently?');
    if (!shouldDelete) return;

    try {
      setDeletingPostId(post._id);
      const res = await axios.delete(`/api/posts/${post._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setDynamicPosts((prev) => prev.filter((item) => item._id !== post._id));
      setCommentDrafts((prev) => {
        const nextDrafts = { ...prev };
        delete nextDrafts[post._id];
        return nextDrafts;
      });
      setOpenComments((prev) => {
        const nextState = { ...prev };
        delete nextState[post._id];
        return nextState;
      });
      if (editingPostId === post._id) {
        setEditingPostId('');
        setEditingPostContent('');
      }
      onPostDeleted(post._id);
      setStatus(res.data?.msg || 'Post deleted successfully.');
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to delete post.';
      setStatus(message);
    } finally {
      setDeletingPostId('');
    }
  };

  return (
    <div className="post-feed-wrap">
      <div className="post-creator-card">
        <div className="post-creator-input">
          {avatarUrl && !composerAvatarFailed ? (
            <img
              src={avatarUrl}
              alt="Your avatar"
              className="avatar post-composer-avatar-img"
              onError={() => setComposerAvatarFailed(true)}
            />
          ) : (
            <div className="avatar post-composer-avatar-fallback" role="img" aria-label="Your avatar">
              {composerInitial}
            </div>
          )}
          <textarea
            ref={composerInputRef}
            className="post-start-input"
            placeholder="Start a post"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
        </div>

        <div className="post-creator-meta">
          <p className="post-visibility-note">
            {/* Post visibility is managed in Privacy settings. */}
          </p>
        </div>

        {mediaFile && (
          <div className="post-selected-file">
            <p><strong>Selected media:</strong> {mediaFile.name}</p>
            <button type="button" className="post-remove-selected-btn" onClick={removeSelectedMedia}>
              Remove media
            </button>
          </div>
        )}

        {attachmentFile && (
          <div className="post-selected-file">
            <p><strong>Secure attachment:</strong> {attachmentFile.name}</p>
            <button type="button" className="post-remove-selected-btn" onClick={removeSelectedAttachment}>
              Remove secure file
            </button>
          </div>
        )}

        {mediaPreviewUrl && (
          <div className="post-media-preview">
            {mediaFile?.type?.startsWith('video/') ? (
              <video controls src={mediaPreviewUrl} className="post-preview-video" />
            ) : (
              <img src={mediaPreviewUrl} alt="Selected media preview" className="post-preview-image" />
            )}
          </div>
        )}

        <div className="post-creator-actions">
          <button type="button" onClick={() => mediaInputRef.current?.click()}>Video / Photo</button>
          <button type="button" onClick={() => attachmentInputRef.current?.click()}>Secure File</button>
          <button type="button" onClick={() => composerInputRef.current?.focus()}>Write article</button>
        </div>

        <div className="post-publish-row">
          <button type="button" className="post-publish-btn" onClick={handlePublish} disabled={posting}>
            {posting ? 'Publishing...' : 'Publish'}
          </button>
          {status && <p className="post-status-message">{status}</p>}
        </div>

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,video/mp4,video/webm"
          style={{ display: 'none' }}
          onChange={handleMediaPick}
        />

        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          style={{ display: 'none' }}
          onChange={handleAttachmentPick}
        />
      </div>

      <div className="post-feed">
        {loading ? (
          <div className="post-empty-state">Loading posts...</div>
        ) : visiblePosts.length === 0 ? (
          <div className="post-empty-state">
            {showOnlyCurrentUserPosts
              ? "You haven't created any posts yet. Share your first update."
              : 'No posts yet. Share your first update with your connections.'}
          </div>
        ) : (
          visiblePosts.map((post) => {
            const userInitial = (post.user?.username || 'U').charAt(0).toUpperCase();
            const authorAvatar = post.user?.avatar
              ? resolveImageUrl(post.user.avatar)
              : '';
            const mediaUrl = post.mediaUrl
              ? resolveAssetUrl(post.mediaUrl, token)
              : post.imageUrl
                ? resolveAssetUrl(post.imageUrl, token)
                : '';
            const mediaType = post.mediaType || (mediaUrl.match(/\.(mp4|webm)(\?|$)/i) ? 'video' : 'image');
            const likedByCurrentUser = isPostLikedByCurrentUser(post);
            const sharedByCurrentUser = isPostSharedByCurrentUser(post);
            const likesCount = Array.isArray(post.likes) ? post.likes.length : Number(post.likes || 0);
            const comments = Array.isArray(post.comments) ? post.comments : [];
            const commentsCount = comments.length;
            const sharesCount = Array.isArray(post.shares) ? post.shares.length : Number(post.shares || 0);
            const isOwnPost = isOwnerPost(post);
            const canEditPost = isPostEditable(post);
            const isEditingPost = editingPostId === post._id;
            const isBusyWithEdit = savingEditPostId === post._id;
            const isBusyWithDelete = deletingPostId === post._id;
            const canOpenAuthorProfile = Boolean(post.user?._id);

            return (
              <div key={post._id} className="post" id={`post-${post._id}`}>
                <div className="post-header">
                  <button
                    type="button"
                    className="post-author-trigger"
                    onClick={() => openPostAuthorProfile(post)}
                    disabled={!canOpenAuthorProfile}
                    title={canOpenAuthorProfile ? 'View profile' : 'Profile unavailable'}
                  >
                    <AvatarWithFallback
                      src={authorAvatar}
                      alt={`${post.user?.username || 'User'} avatar`}
                      initial={userInitial}
                      imageClassName="avatar"
                      fallbackClassName="avatar avatar-initial"
                      fallbackStyle={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#1e7ae0',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '18px'
                      }}
                    />
                  </button>
                  <div className="post-author-meta">
                    <button
                      type="button"
                      className="post-author-link"
                      onClick={() => openPostAuthorProfile(post)}
                      disabled={!canOpenAuthorProfile}
                      title={canOpenAuthorProfile ? 'View profile' : 'Profile unavailable'}
                    >
                      {post.user?.username || 'Unknown user'}
                    </button>
                    <p className="post-subtitle">{post.user?.title || 'Security member'} - {formatPostTime(post.createdAt)}</p>
                  </div>
                  <div className="post-header-right">
                    {isOwnPost && (
                      <div className="post-owner-controls">
                        <button
                          type="button"
                          className="post-owner-btn"
                          onClick={() => handleStartEditingPost(post)}
                          disabled={!canEditPost || isBusyWithEdit || isBusyWithDelete}
                          title={canEditPost ? 'Edit post' : 'Editing window closed after 24 hours'}
                        >
                          <FiEdit2 size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="post-owner-btn danger"
                          onClick={() => handleDeletePost(post)}
                          disabled={isBusyWithDelete || isBusyWithEdit}
                          title="Delete post"
                        >
                          <FiTrash2 size={14} />
                          <span>{isBusyWithDelete ? 'Deleting...' : 'Delete'}</span>
                        </button>
                      </div>
                    )}
                    <span className={`visibility ${post.visibility}`}>{post.visibility}</span>
                  </div>
                </div>

                {mediaUrl && mediaType === 'video' && (
                  <video controls className="post-media" src={mediaUrl} />
                )}

                {mediaUrl && mediaType !== 'video' && (
                  <img src={mediaUrl} alt="post media" className="post-image" />
                )}

                {isOwnPost && !canEditPost && (
                  <p className="post-owner-note">Edit window closed. Posts can be edited only in the first 24 hours.</p>
                )}

                {isEditingPost ? (
                  <div className="post-edit-panel">
                    <textarea
                      className="post-edit-input"
                      value={editingPostContent}
                      onChange={(event) => setEditingPostContent(event.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder="Update your post..."
                      disabled={isBusyWithEdit || isBusyWithDelete}
                    />
                    <div className="post-edit-actions">
                      <button
                        type="button"
                        className="post-owner-btn"
                        onClick={() => handleSaveEditedPost(post)}
                        disabled={isBusyWithEdit || isBusyWithDelete}
                      >
                        {isBusyWithEdit ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        className="post-owner-btn"
                        onClick={handleCancelEditingPost}
                        disabled={isBusyWithEdit || isBusyWithDelete}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  post.content && <p className="post-copy">{post.content}</p>
                )}

                <div className="post-stats-row">
                  <span>{likesCount} like{likesCount === 1 ? '' : 's'}</span>
                  <span>{commentsCount} comment{commentsCount === 1 ? '' : 's'}</span>
                  <span>{sharesCount} share{sharesCount === 1 ? '' : 's'}</span>
                </div>

                {post.hasAttachment && (
                  <div className="post-attachment">
                    <strong>Secure attachment:</strong> {post.attachmentName || 'Protected file'}
                    {post.downloadUrl ? (
                      <button
                        type="button"
                        className="download-link download-link-button"
                        onClick={() => handleAttachmentDownload(post)}
                        disabled={downloadingAttachmentPostId === post._id}
                      >
                        {downloadingAttachmentPostId === post._id ? 'Preparing download...' : 'Download secure attachment'}
                      </button>
                    ) : (
                      <span className="attachment-locked">Download requires an accepted connection</span>
                    )}
                  </div>
                )}

                <div className="post-actions">
                  <button
                    type="button"
                    onClick={() => handleLike(post)}
                    disabled={likingPostId === post._id || isBusyWithDelete || isBusyWithEdit}
                    className={`post-action-btn ${likedByCurrentUser ? 'post-action-active' : ''}`}
                    title={likedByCurrentUser ? 'Liked' : 'Like'}
                  >
                    <FiThumbsUp size={18} />
                    <span className="action-count">{likesCount > 0 ? likesCount : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCommentsPanel(post._id)}
                    disabled={isBusyWithDelete}
                    className="post-action-btn"
                    title="Comment"
                  >
                    <FiMessageCircle size={18} />
                    <span className="action-count">{commentsCount > 0 ? commentsCount : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(post)}
                    disabled={sharingPostId === post._id || isBusyWithDelete || isBusyWithEdit}
                    className={`post-action-btn ${sharedByCurrentUser ? 'post-action-active' : ''}`}
                    title={sharedByCurrentUser ? 'Shared' : 'Share'}
                  >
                    <FiShare2 size={18} />
                    <span className="action-count">{sharesCount > 0 ? sharesCount : ''}</span>
                  </button>
                </div>

                {openComments[post._id] && (
                  <div className="post-comments-panel">
                    {comments.length === 0 ? (
                      <p className="post-no-comments">No comments yet. Start the conversation.</p>
                    ) : (
                      <div className="post-comments-list">
                        {comments.map((comment, index) => {
                          const commentKey = comment._id || `${post._id}-comment-${index}`;
                          const commenterAvatar = comment.user?.avatar
                            ? resolveAssetUrl(comment.user.avatar)
                            : '';
                          const commenterInitial = (comment.user?.username || 'U').charAt(0).toUpperCase();

                          return (
                            <div key={commentKey} className="post-comment-item">
                              <AvatarWithFallback
                                src={commenterAvatar}
                                alt={`${comment.user?.username || 'User'} avatar`}
                                initial={commenterInitial}
                                imageClassName="comment-avatar"
                                fallbackClassName="comment-avatar"
                                fallbackStyle={{
                                  display: 'grid',
                                  placeItems: 'center',
                                  background: '#1e7ae0',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  fontSize: '13px'
                                }}
                              />
                              <div className="post-comment-body">
                                <p className="post-comment-meta">
                                  <strong>{comment.user?.username || 'Unknown user'}</strong>
                                  <span>{formatPostTime(comment.timestamp)}</span>
                                </p>
                                <p className="post-comment-text">{comment.text}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <form className="post-comment-form" onSubmit={(event) => handleCommentSubmit(event, post)}>
                      <input
                        type="text"
                        placeholder="Write a comment..."
                        value={commentDrafts[post._id] || ''}
                        disabled={isBusyWithDelete || isBusyWithEdit}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [post._id]: value
                          }));
                        }}
                        maxLength={500}
                      />
                      <button type="submit" disabled={commentingPostId === post._id || isBusyWithDelete || isBusyWithEdit}>
                        {commentingPostId === post._id ? 'Posting...' : 'Post'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {shareModalOpen && (
        <div className="share-modal-backdrop" onClick={closeShareModal}>
          <div className="share-modal" onClick={(event) => event.stopPropagation()}>
            <div className="share-modal-header">
              <h3>Share post</h3>
              <button type="button" className="share-close-btn" onClick={closeShareModal} disabled={sendingShare}>x</button>
            </div>

            <p className="share-modal-subtitle">Choose who should receive this post.</p>
            <input
              className="share-search-input"
              type="text"
              placeholder="Search connections..."
              value={shareSearch}
              onChange={(event) => setShareSearch(event.target.value)}
              disabled={sendingShare}
            />

            {selectedRecipients.length > 0 && (
              <div className="share-selected-strip">
                {selectedRecipients.map((recipient) => (
                  <button
                    type="button"
                    key={recipient._id}
                    className="share-selected-chip"
                    onClick={() => toggleConnectionSelection(recipient)}
                    disabled={sendingShare}
                    aria-label={`Remove ${recipient.username}`}
                  >
                    <span>{recipient.username}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
              </div>
            )}

            {searchingShareUsers && !loadingConnections && shareListSections.length > 0 && (
              <p className="share-search-status">Searching...</p>
            )}

            <div className="share-connection-list">
              {loadingConnections ? (
                <p className="share-empty-state">Loading connections...</p>
              ) : shareListSections.length === 0 ? (
                <p className="share-empty-state">
                  {shareSearch.trim()
                    ? (searchingShareUsers ? 'Searching...' : (shareSearchStatus || 'No matching connections found.'))
                    : 'Search connections to share this post.'}
                </p>
              ) : (
                shareListSections.map((section) => (
                  <div key={section.key} className="share-list-section">
                    <p className="share-section-label">{section.title}</p>
                    {section.items.map((connection) => {
                      const connectionId = String(connection._id);
                      const isSelected = selectedConnectionIds.includes(connectionId);
                      const canMessage = connection.allowsMessages !== false;
                      const connectionAvatar = resolveAssetUrl(connection.avatar);
                      const connectionInitial = (connection.username || 'U').charAt(0).toUpperCase();

                      return (
                        <button
                          type="button"
                          key={connectionId}
                          className={`share-connection-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => canMessage && toggleConnectionSelection(connection)}
                          disabled={sendingShare || !canMessage}
                        >
                          <AvatarWithFallback
                            src={connectionAvatar}
                            alt={`${connection.username || 'Connection'} avatar`}
                            initial={connectionInitial}
                            imageClassName="share-connection-avatar"
                            fallbackClassName="share-connection-avatar"
                            fallbackStyle={{
                              display: 'grid',
                              placeItems: 'center',
                              background: '#1e7ae0',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '15px'
                            }}
                          />
                          <div className="share-connection-details">
                            <strong>{connection.username}</strong>
                            <span>{connection.jobTitle || connection.location || 'Trust node member'}</span>
                            {!canMessage && <em>Messages disabled</em>}
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            aria-label={`Select ${connection.username}`}
                            disabled={sendingShare || !canMessage}
                          />
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="share-modal-actions">
              <button type="button" className="share-cancel-btn" onClick={closeShareModal} disabled={sendingShare}>
                Cancel
              </button>
              <button
                type="button"
                className="share-send-btn"
                onClick={shareToSelectedConnections}
                disabled={sendingShare || !selectedConnectionIds.length}
              >
                {sendingShare ? 'Sharing...' : `Share (${selectedConnectionIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostFeed;
