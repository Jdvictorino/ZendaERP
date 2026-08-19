import React from 'react';

export default function Input({ className = '', leftIcon = null, rightIcon = null, ...props }) {
  return (
    <div className={`relative ${className}`}>
      {leftIcon && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
          {leftIcon}
        </div>
      )}
      <input
        className={`input-base ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''}`}
        {...props}
      />
      {rightIcon && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
          {rightIcon}
        </div>
      )}
    </div>
  );
}
