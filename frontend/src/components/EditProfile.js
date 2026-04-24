import React, { useState } from 'react';
import axios from 'axios';

const splitByComma = (value) => (
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const EditProfile = ({ profile, onClose, onUpdate }) => {
  const initialProfile = profile.profile || {};

  const [formData, setFormData] = useState({
    username: profile.username || '',
    bio: initialProfile.bio || '',
    jobTitle: initialProfile.jobTitle || '',
    location: initialProfile.location || '',
    qualification: initialProfile.qualification || '',
    experience: initialProfile.experience || '',
    education: initialProfile.education || '',
    skills: (initialProfile.skills || []).join(', '),
    interests: (initialProfile.interests || []).join(', '),
    badges: (initialProfile.badges || []).join(', ')
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const updates = {
        username: formData.username,
        bio: formData.bio,
        jobTitle: formData.jobTitle,
        location: formData.location,
        qualification: formData.qualification,
        experience: formData.experience,
        education: formData.education,
        skills: splitByComma(formData.skills),
        interests: splitByComma(formData.interests),
        badges: splitByComma(formData.badges)
      };

      const res = await axios.patch('/api/profile', updates, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      onUpdate(res.data.profile);
      onClose();
    } catch (error) {
      console.error('Update failed:', error);
      alert(`Update failed: ${error.response?.data?.msg || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-profile-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Edit profile details</h3>
            <p>Complete your profile like a professional network card.</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close edit profile dialog">
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-profile-form">
          <section className="edit-form-section">
            <h4>Identity</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Display name</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Your display name"
                  maxLength={80}
                />
              </div>
              <div className="form-group">
                <label>Job title</label>
                <input
                  type="text"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleChange}
                  placeholder="e.g. Product Security Engineer"
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="City, State"
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label>Qualification</label>
                <input
                  type="text"
                  name="qualification"
                  value={formData.qualification}
                  onChange={handleChange}
                  placeholder="e.g. B.Tech in Cyber Security"
                  maxLength={140}
                />
              </div>
            </div>
          </section>

          <section className="edit-form-section">
            <h4>Professional story</h4>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>About</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  rows="4"
                  placeholder="Summarize your strengths, impact, and current focus"
                  maxLength={600}
                />
                <small className="char-counter">{formData.bio.length}/600</small>
              </div>
              <div className="form-group full-width">
                <label>Experience</label>
                <textarea
                  name="experience"
                  value={formData.experience}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Describe projects, outcomes, and responsibilities"
                  maxLength={700}
                />
              </div>
              <div className="form-group full-width">
                <label>Education</label>
                <textarea
                  name="education"
                  value={formData.education}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Add your degree, institution, and specialization"
                  maxLength={500}
                />
              </div>
            </div>
          </section>

          <section className="edit-form-section">
            <h4>Discoverability</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Skills</label>
                <input
                  type="text"
                  name="skills"
                  value={formData.skills}
                  onChange={handleChange}
                  placeholder="Security Testing, Python, Cloud"
                />
                <small className="field-hint">Comma separated list</small>
              </div>
              <div className="form-group">
                <label>Interests</label>
                <input
                  type="text"
                  name="interests"
                  value={formData.interests}
                  onChange={handleChange}
                  placeholder="AI Security, Mentoring, Threat Intel"
                />
                <small className="field-hint">Comma separated list</small>
              </div>
              <div className="form-group full-width">
                <label>Badges and certifications</label>
                <input
                  type="text"
                  name="badges"
                  value={formData.badges}
                  onChange={handleChange}
                  placeholder="CEH, CISSP, AWS Security Specialty"
                />
                <small className="field-hint">These are shown as highlights on your profile.</small>
              </div>
            </div>
          </section>

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="save-btn">
              {loading ? 'Saving profile...' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
