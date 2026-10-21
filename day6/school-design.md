# School Database Design

## Tables

- **students** stores each student's unique ID, required full name, and unique email address.
- **courses** stores each course's unique ID, required name, and instructor.
- **enrolments** records a student's participation in a course and the grade earned. Its composite primary key (`student_id`, `course_id`) prevents duplicate enrolments for the same student and course.

## Relationships

A student can have many enrolment records, so students-to-enrolments is one-to-many. A course can also have many enrolment records, so courses-to-enrolments is one-to-many. Together, these represent a many-to-many relationship between students and courses: a student can take multiple courses, and a course can contain multiple students. The enrolments join table is needed to represent each pairing and to store relationship-specific data, such as the grade.

## Index

I would add an index on `enrolments.course_id` to speed up lookups and joins that list students in a course or count enrolments per course. The schema creates this index as `idx_enrolments_course_id`.

## SQL or NoSQL?

I would choose a relational SQL database for this school system. Students, courses, and enrolments have clear relationships, and foreign keys and unique constraints protect their integrity. SQL joins make the required course and student reports straightforward, while a document database would duplicate related data or require additional application-level checks to keep enrolments consistent.
