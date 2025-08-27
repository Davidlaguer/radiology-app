# Overview

This is a radiology medical report generation application that automates the creation of CT (Computed Tomography) scan reports. The app takes medical findings dictated by radiologists and generates structured medical reports following specific medical writing standards. It features a clean, minimal interface designed as a compact popup-style application that processes user input (study labels and medical findings) and outputs formatted reports with standardized sections for TÉCNICA, HALLAZGOS, and CIERRE.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Shadcn/ui component library built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Forms**: React Hook Form with Zod for validation and form handling

## Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Structure**: RESTful API with centralized route registration
- **Request Processing**: Express middleware for JSON parsing, logging, and error handling
- **Storage**: In-memory storage implementation with interface for future database integration

## Data Storage Solutions
- **Current**: In-memory storage using Map data structures for development
- **Database Setup**: Drizzle ORM configured for PostgreSQL with Neon Database serverless driver
- **Schema Management**: Shared schema definitions between client and server using Zod
- **Migrations**: Drizzle Kit for database schema migrations

## Authentication and Authorization
- **Session Management**: Connect-pg-simple for PostgreSQL session storage (configured but not implemented)
- **User Model**: Basic user schema with username/ID structure in place
- **Current State**: Authentication system scaffolded but not actively used in medical report generation

## External Dependencies
- **Database**: Neon Database (PostgreSQL serverless) - configured but not actively used
- **UI Libraries**: Radix UI components for accessible UI primitives
- **Development Tools**: Replit integration for development environment
- **Build Tools**: ESBuild for server bundling, Vite for client bundling
- **Validation**: Zod for runtime type validation and schema definition
- **Date Handling**: date-fns for date manipulation utilities

The application follows a clean separation between client and server with shared type definitions, making it easy to maintain and extend. The medical report generation logic is currently implemented as a simple processing function that formats findings into standardized medical report sections.