PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  course_name TEXT NOT NULL UNIQUE,
  instructor TEXT NOT NULL
);

CREATE TABLE enrolments (
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade TEXT NOT NULL,
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES students (student_id),
  FOREIGN KEY (course_id) REFERENCES courses (course_id)
);

CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);

INSERT INTO students (student_id, full_name, email) VALUES
  (1, 'Amina Hassan', 'amina.hassan@example.com'),
  (2, 'Brian Otieno', 'brian.otieno@example.com'),
  (3, 'Wanjiku Kamau', 'wanjiku.kamau@example.com');

INSERT INTO courses (course_id, course_name, instructor) VALUES
  (1, 'Introduction to Databases', 'Dr. Njeri Mwangi'),
  (2, 'Web Development', 'Mr. David Kiptoo'),
  (3, 'Data Structures', 'Ms. Grace Achieng');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'B'),
  (1, 2, 'A'),
  (1, 3, 'B'),
  (2, 1, 'C'),
  (2, 2, 'B');

-- 1. List the courses and grades for one student, selected by name.
SELECT c.course_name, e.grade
FROM students AS s
JOIN enrolments AS e ON e.student_id = s.student_id
JOIN courses AS c ON c.course_id = e.course_id
WHERE s.full_name = 'Amina Hassan'
ORDER BY c.course_name;

-- 2. List the students enrolled on one course.
SELECT s.full_name, e.grade
FROM courses AS c
JOIN enrolments AS e ON e.course_id = c.course_id
JOIN students AS s ON s.student_id = e.student_id
WHERE c.course_name = 'Introduction to Databases'
ORDER BY s.full_name;

-- 3. Count students for every course, including courses with no enrolments.
SELECT c.course_name, COUNT(e.student_id) AS student_count
FROM courses AS c
LEFT JOIN enrolments AS e ON e.course_id = c.course_id
GROUP BY c.course_id, c.course_name
ORDER BY c.course_id;

-- 4. Find students who have no enrolments.
SELECT s.full_name
FROM students AS s
LEFT JOIN enrolments AS e ON e.student_id = s.student_id
WHERE e.student_id IS NULL
ORDER BY s.full_name;

-- 5. Update one student's grade on one course.
UPDATE enrolments
SET grade = 'A'
WHERE student_id = (
  SELECT student_id FROM students WHERE full_name = 'Amina Hassan'
)
AND course_id = (
  SELECT course_id FROM courses WHERE course_name = 'Introduction to Databases'
);
