import React, { useState } from 'react';
import axios from 'axios';

const Upload = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setMessage('');
      setDownloadUrl('');

      const res = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      setMessage('Upload successful. File saved securely.');
      setDownloadUrl(res.data.downloadUrl);
    } catch (error) {
      setMessage(error.response?.data?.msg || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files[0])}
        accept="image/jpeg,image/png,application/pdf"
      />
      <button onClick={handleUpload} disabled={uploading || !file}>
        {uploading ? 'Uploading...' : 'Secure Upload'}
      </button>
      {message && <p>{message}</p>}
      {downloadUrl && (
        <p>
          Download: <a href={downloadUrl} target="_blank" rel="noreferrer">Secure file link</a>
        </p>
      )}
    </div>
  );
};

export default Upload;
