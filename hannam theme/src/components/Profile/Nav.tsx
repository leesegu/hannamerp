
import React from "react";
import { Link, useLocation } from "react-router-dom";

const Nav: React.FC = () => {
  const pathname = useLocation();

  return (
    <>
      <ul className="mb-[25px] text-center">
        <li className="inline-block mx-[3px]">
          <Link
            to="/profile/user-profile"
            className={`block py-[8.5px] px-[15px] font-medium rounded-md border hover:bg-primary-500 hover:text-white  ${
              pathname.pathname === "/profile/user-profile"
                ? "bg-primary-500 text-white border-primary-500"
                : ""
            }`}
          >
            Profile
          </Link>
        </li>

        <li className="inline-block mx-[3px]">
          <Link
            to="/profile/teams"
            className={`block py-[8.5px] px-[15px] font-medium rounded-md border hover:bg-primary-500 hover:text-white  ${
              pathname.pathname === "/profile/teams"
                ? "bg-primary-500 text-white border-primary-500"
                : ""
            }`}
          >
            Teams
          </Link>
        </li>

        <li className="inline-block mx-[3px]">
          <Link
            to="/profile/projects"
            className={`block py-[8.5px] px-[15px] font-medium rounded-md border hover:bg-primary-500 hover:text-white  ${
              pathname.pathname === "/profile/projects"
                ? "bg-primary-500 text-white border-primary-500"
                : ""
            }`}
          >
            Projects
          </Link>
        </li>
      </ul>
    </>
  );
};

export default Nav;
