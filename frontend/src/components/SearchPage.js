import React, { useMemo, useState } from 'react';
import axios from 'axios';

const CATEGORY_OPTIONS = [
  { key: 'people', label: 'People' },
  { key: 'company', label: 'Company' },
  { key: 'groups', label: 'Groups' },
  { key: 'newsletters', label: 'Newsletters' },
  { key: 'posts', label: 'Posts' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'internships', label: 'Internships' }
];

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const SearchPage = ({ onSelectProfile = () => {} }) => {
  const [activeCategory, setActiveCategory] = useState('people');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Search people, companies, groups, posts, jobs, and internships.');

  const activeCategoryLabel = useMemo(() => (
    CATEGORY_OPTIONS.find((category) => category.key === activeCategory)?.label || 'Results'
  ), [activeCategory]);

  const resolveAvatarUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const handleCategoryChange = (categoryKey, label) => {
    setActiveCategory(categoryKey);
    setResults([]);
    setMessage(`Search ${label.toLowerCase()} by keyword.`);
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setMessage('Please enter a search term.');
      setResults([]);
      return;
    }

    setLoading(true);
    setMessage(`Searching ${activeCategoryLabel.toLowerCase()}...`);
    try {
      const response = await axios.get(
        `/api/profile/search?q=${encodeURIComponent(trimmedQuery)}&category=${encodeURIComponent(activeCategory)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      const nextResults = response.data?.results || [];
      setResults(nextResults);
      if (!nextResults.length) {
        setMessage(`No matching ${activeCategoryLabel.toLowerCase()} results were found.`);
      } else {
        setMessage(`${nextResults.length} ${activeCategoryLabel.toLowerCase()} result(s) found.`);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setMessage('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderPersonResult = (user) => {
    const avatarUrl = resolveAvatarUrl(user.profile?.avatar || '');

    return (
      <article
        key={user._id}
        className="search-result-card clickable"
        onClick={() => onSelectProfile(user)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSelectProfile(user);
        }}
      >
        <div className="result-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.username} />
          ) : (
            <span>{user.username?.charAt(0).toUpperCase() || 'U'}</span>
          )}
        </div>
        <div className="result-info">
          <h3>{user.username}</h3>
          <p className="result-line">{user.profile?.jobTitle || 'No headline yet'}</p>
          <p className="result-line">{user.profile?.location || 'Location not set'}</p>
          <p className="result-note">Profile visibility: <strong>{user.privacy?.profile || 'public'}</strong></p>
          {!user.isFriend && user.privacy?.profile === 'friends' && (
            <p className="result-note">This profile is visible to connections only.</p>
          )}
        </div>
      </article>
    );
  };

  const renderCompanyResult = (company) => (
    <article key={company._id} className="search-result-card">
      <div className="result-info">
        <h3>{company.name}</h3>
        <p className="result-line">{company.memberCount || 0} matching member(s)</p>
        {company.sampleRoles?.length ? (
          <p className="result-note">Sample roles: {company.sampleRoles.join(', ')}</p>
        ) : null}
        {company.sampleLocations?.length ? (
          <p className="result-note">Locations: {company.sampleLocations.join(', ')}</p>
        ) : null}
      </div>
    </article>
  );

  const renderGroupResult = (group) => (
    <article key={group._id} className="search-result-card">
      <div className="result-info">
        <h3>{group.name}</h3>
        <p className="result-line">{group.memberCount || 0} member(s) share this topic</p>
      </div>
    </article>
  );

  const renderPostLikeResult = (item) => {
    const avatarUrl = resolveAvatarUrl(item.author?.avatar || '');
    const postedOn = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';

    return (
      <article key={item._id} className="search-result-card">
        <div className="result-info">
          <h3>{item.author?.username || 'Member'}</h3>
          <p className="result-line">{item.author?.jobTitle || 'Trust Node member'}</p>
          <p className="result-note">{item.snippet || item.content || 'No content'}</p>
          <p className="result-note">
            {postedOn ? `Posted ${postedOn}` : 'Recently posted'}
            {typeof item.stats?.likes === 'number' ? ` | Likes: ${item.stats.likes}` : ''}
            {typeof item.stats?.comments === 'number' ? ` | Comments: ${item.stats.comments}` : ''}
          </p>
        </div>
        <div className="result-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt={item.author?.username || 'Member'} />
          ) : (
            <span>{(item.author?.username || 'M').charAt(0).toUpperCase()}</span>
          )}
        </div>
      </article>
    );
  };

  const renderResult = (item) => {
    if (item.resultType === 'company') return renderCompanyResult(item);
    if (item.resultType === 'groups') return renderGroupResult(item);
    if (
      item.resultType === 'posts'
      || item.resultType === 'newsletters'
      || item.resultType === 'jobs'
      || item.resultType === 'internships'
    ) {
      return renderPostLikeResult(item);
    }
    return renderPersonResult(item);
  };

  return (
    <main className="page-content search-page">
      <section className="search-header-card">
        <h1>Search Trust node</h1>
        <p>Search people, companies, groups, newsletters, posts, jobs, and internships.</p>
        <div className="search-categories">
          {CATEGORY_OPTIONS.map((category) => (
            <button
              key={category.key}
              type="button"
              className={`category-pill ${activeCategory === category.key ? 'active' : ''}`}
              onClick={() => handleCategoryChange(category.key, category.label)}
            >
              {category.label}
            </button>
          ))}
        </div>
      </section>

      <section className="search-panel">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-bar-wrapper">
            <input
              type="search"
              placeholder={`Search ${activeCategoryLabel.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="search-input"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        <p className="search-status">{message}</p>
      </section>

      <section className="search-results-grid">
        {results.map((item) => renderResult(item))}
      </section>
    </main>
  );
};

export default SearchPage;
